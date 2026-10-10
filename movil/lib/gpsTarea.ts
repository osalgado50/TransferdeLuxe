// Tarea de ubicación en segundo plano. Se define a nivel de módulo y se importa desde app/_layout.tsx para que
// quede registrada al arrancar, también cuando el SO relanza la app sin interfaz para entregar ubicaciones.
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PREFIJO_GPS, claveCola, claveOn, claveUltimo, clasificarRefresco, decidirLote, decisionSesion, debeEnviarNativo,
  encolarPosicion, filaPosicion, filtrarCola, sigueActivo, trozos, velocidadValida, type EstadoSesionGps, type PosicionPendiente,
} from "@dominio/gpsNativo";
import { ENVIO_TIMEOUT_MS } from "@dominio/gps";
import * as Location from "expo-location";
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
  const claves = id ? [claveCola(id), claveUltimo(id), ...(conFlag ? [claveOn(id)] : [])]
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

async function procesar(ultima: Location.LocationObject) {
  const ahora = Date.now();
  const { estado, id } = await estadoSesion();
  if (!id) { await parar(); await limpiarDatosGps(undefined, true); return; }
  const gen = await AsyncStorage.getItem(claveOn(id));
  const activo = async () => sigueActivo(gen, await AsyncStorage.getItem(claveOn(id)));
  const decision = decidirLote(gen !== null, estado);
  if (decision === "parar_y_limpiar") { await parar(); await limpiarDatosGps(id, true); return; } // sin token no hay «fuera de servicio» posible
  if (decision === "descartar") return;
  if (!debeEnviarNativo(ahora, await leerUltimoEnvio(id))) return;
  const p: PosicionPendiente = {
    dueno: id, lat: ultima.coords.latitude, lng: ultima.coords.longitude,
    velocidad: velocidadValida(ultima.coords.speed), precision_m: ultima.coords.accuracy ?? null, ts: ultima.timestamp || ahora,
  };
  let pendientes = [...(await leerCola(id)), p];
  const guardar = async () => {
    if (!(await activo())) return;
    const cola = pendientes.slice(0, -1).reduce<PosicionPendiente[]>((c, x) => encolarPosicion(c, x), []);
    await AsyncStorage.setItem(claveCola(id), JSON.stringify(pendientes.length ? encolarPosicion(cola, pendientes.at(-1)!) : []));
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

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
  const ultima = data?.locations?.at(-1);
  if (error || !ultima || enVuelo) return;
  enVuelo = procesar(ultima).catch((e) => console.warn("[gps] tarea", e)).finally(() => { enVuelo = null; });
  await enVuelo;
});
