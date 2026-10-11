// Tarea de ubicación en segundo plano. Se define a nivel de módulo y se importa desde app/_layout.tsx para que
// quede registrada al arrancar, también cuando el SO relanza la app sin interfaz para entregar ubicaciones.
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PREFIJO_GPS, claveCola, claveOn, claveRef, claveUltimo, clasificarRefresco, decidirLote, decisionSesion, seleccionarPuntos,
  encolarPosicion, filaPosicion, filtrarCola, sigueActivo, trozos, velocidadValida, type EstadoSesionGps, type PosicionPendiente, type Referencia,
} from "@dominio/gpsNativo";
import { ENVIO_TIMEOUT_MS } from "@dominio/gps";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

export const TAREA_GPS = "tvl-gps-servicio";

async function leerCola(id: string): Promise<PosicionPendiente[]> {
  try { return filtrarCola(JSON.parse((await AsyncStorage.getItem(claveCola(id))) ?? "[]") as PosicionPendiente[], id); }
  catch { return []; }
}

export async function leerUltimoEnvio(id: string): Promise<number | null> {
  const v = await AsyncStorage.getItem(claveUltimo(id)).catch(() => null);
  return v ? Number(v) : null;
}

/** Borra cola y último envío (de un conductor o de todos). */
export async function limpiarDatosGps(id?: string, conFlag = false): Promise<void> {
  const claves = id ? [claveCola(id), claveUltimo(id), claveRef(id), ...(conFlag ? [claveOn(id)] : [])]
    : (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIJO_GPS) && (conFlag || !k.startsWith(`${PREFIJO_GPS}on:`)));
  if (claves.length) await AsyncStorage.multiRemove(claves);
}

async function estadoSesion(): Promise<{ estado: EstadoSesionGps; id: string | null }> {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  const id = s?.user.id ?? null;
  const d = decisionSesion(!!s, s?.expires_at, Date.now());
  if (d !== "refrescar") return { estado: d, id };
  try {
    const r = await supabase.auth.refreshSession();
    return { estado: clasificarRefresco(!!r.data.session, r.error), id };
  } catch { return { estado: "reintentar", id }; }
}

let enVuelo: Promise<void> | null = null;
/** Espera al lote en curso (para no enviar «fuera de servicio» antes de que acabe un insert). */
export const esperarLoteEnCurso = () => enVuelo ?? Promise.resolve();

async function leerRef(id: string): Promise<Referencia | null> {
  try { return JSON.parse((await AsyncStorage.getItem(claveRef(id))) ?? "null") as Referencia | null; } catch { return null; }
}

/** Aviso local al conductor: el GPS se ha parado porque la sesión ya no es válida. */
const avisarGpsDetenido = () => Notifications.scheduleNotificationAsync({
  content: { title: "GPS detenido", body: "Tu sesión ha caducado. Abre TVL Conductor y vuelve a entrar para seguir en servicio." },
  trigger: null,
}).catch(() => undefined);

async function procesar(lote: Location.LocationObject[]) {
  const ahora = Date.now();
  const { estado, id } = await estadoSesion();
  if (!id) { await parar(); await limpiarDatosGps(undefined, true); await avisarGpsDetenido(); return; }
  const gen = await AsyncStorage.getItem(claveOn(id));
  const activo = async () => sigueActivo(gen, await AsyncStorage.getItem(claveOn(id)));
  const decision = decidirLote(gen !== null, estado);
  if (decision === "parar_y_limpiar") { // sin token no hay «fuera de servicio» posible
    const estabaOn = gen !== null;
    await parar(); await limpiarDatosGps(id, true);
    if (estabaOn) await avisarGpsDetenido();
    return;
  }
  if (decision === "descartar") return;
  // Todos los fixes del lote (tras un túnel llegan varios), separados ≥ 12 s, o ≥ 60 s con el coche parado.
  const fixes = lote.map((l) => ({ lat: l.coords.latitude, lng: l.coords.longitude, velocidad: velocidadValida(l.coords.speed),
    precision_m: l.coords.accuracy ?? null, ts: l.timestamp || ahora }));
  const { puntos, ref } = seleccionarPuntos(fixes, await leerRef(id));
  if (!puntos.length) return;
  await AsyncStorage.setItem(claveRef(id), JSON.stringify(ref));
  const nuevos: PosicionPendiente[] = puntos.map((x) => ({ dueno: id, ...x }));
  let pendientes = [...(await leerCola(id)), ...nuevos];
  const guardar = async () => {
    if (!(await activo())) return;
    await AsyncStorage.setItem(claveCola(id), JSON.stringify(pendientes.reduce<PosicionPendiente[]>((c, x) => encolarPosicion(c, x), [])));
  };
  if (decision === "encolar") { await guardar(); return; }
  for (const trozo of trozos(pendientes)) {
    if (!(await activo())) return; // OFF durante el envío: no insertar
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ENVIO_TIMEOUT_MS);
    let error: unknown = null;
    try { ({ error } = await supabase.from("posiciones").insert(trozo.map((x) => filaPosicion(id, x, ahora))).abortSignal(ctrl.signal)); }
    catch (e) { error = e; }
    finally { clearTimeout(t); }
    if (error) { await guardar(); return; }
    pendientes = pendientes.slice(trozo.length);
  }
  if (!(await activo())) return;
  await AsyncStorage.multiSet([[claveUltimo(id), String(Date.now())], [claveCola(id), "[]"]]);
}

const parar = () => Location.stopLocationUpdatesAsync(TAREA_GPS).catch(() => undefined);

// Lotes que llegan mientras otro se está enviando: se acumulan en memoria y se procesan a continuación (antes se perdían).
let enEspera: Location.LocationObject[] = [];

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  enEspera = [...enEspera, ...data.locations].slice(-500); // tope de memoria
  if (enVuelo) return; // el bucle en curso lo recoge
  enVuelo = (async () => {
    while (enEspera.length) {
      const lote = enEspera; enEspera = [];
      await procesar(lote).catch((e) => console.warn("[gps] tarea", e));
    }
  })().finally(() => { enVuelo = null; });
  await enVuelo;
});
