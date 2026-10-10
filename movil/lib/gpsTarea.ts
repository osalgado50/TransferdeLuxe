// Tarea de ubicación en segundo plano. Se define a nivel de módulo y se importa desde app/_layout.tsx para que
// quede registrada al arrancar, también cuando el SO relanza la app sin interfaz para entregar ubicaciones.
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  decisionSesion, debeEnviarNativo, encolarPosicion, filaPosicion, velocidadValida, type PosicionPendiente,
} from "@dominio/gpsNativo";
import { ENVIO_TIMEOUT_MS } from "@dominio/gps";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { supabase } from "./supabase";

export const TAREA_GPS = "tvl-gps-servicio";
export const CLAVE_ULTIMO_ENVIO = "tvl:gps:ultimoEnvio";
const CLAVE_COLA = "tvl:gps:cola";

async function leerCola(): Promise<PosicionPendiente[]> {
  try { return JSON.parse((await AsyncStorage.getItem(CLAVE_COLA)) ?? "[]") as PosicionPendiente[]; } catch { return []; }
}
export const vaciarColaGps = () => AsyncStorage.removeItem(CLAVE_COLA);

export async function leerUltimoEnvio(): Promise<number | null> {
  const v = await AsyncStorage.getItem(CLAVE_ULTIMO_ENVIO).catch(() => null);
  return v ? Number(v) : null;
}

/** Sesión válida o null (refresca si caduca en < 60 s). */
async function sesionValida() {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  const d = decisionSesion(!!s, s?.expires_at, Date.now());
  if (d === "sin_sesion") return null;
  if (d === "ok") return s;
  const r = await supabase.auth.refreshSession();
  return r.data.session ?? null;
}

let enCurso = false;

async function procesar(ubicaciones: Location.LocationObject[]) {
  const ultima = ubicaciones.at(-1);
  if (!ultima || enCurso) return;
  const ahora = Date.now();
  if (!debeEnviarNativo(ahora, await leerUltimoEnvio())) return;
  enCurso = true;
  const p: PosicionPendiente = {
    lat: ultima.coords.latitude, lng: ultima.coords.longitude,
    velocidad: velocidadValida(ultima.coords.speed), precision_m: ultima.coords.accuracy ?? null, ts: ultima.timestamp || ahora,
  };
  const cola = await leerCola();
  try {
    let s;
    try { s = await sesionValida(); } catch { s = undefined; } // fallo de red al refrescar: encolar
    if (s === null) { // sesión cerrada: no hay a quién atribuir la posición
      await Location.stopLocationUpdatesAsync(TAREA_GPS).catch(() => undefined);
      return;
    }
    if (!s) { await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(encolarPosicion(cola, p))); return; }
    const filas = [...cola, p].map((x) => filaPosicion(s.user.id, x, ahora));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ENVIO_TIMEOUT_MS);
    let error: unknown = null;
    try { ({ error } = await supabase.from("posiciones").insert(filas).abortSignal(ctrl.signal)); }
    catch (e) { error = e; }
    finally { clearTimeout(t); }
    if (error) {
      await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(encolarPosicion(cola, p)));
      return;
    }
    await AsyncStorage.multiSet([[CLAVE_ULTIMO_ENVIO, String(Date.now())], [CLAVE_COLA, "[]"]]);
  } finally { enCurso = false; }
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  try { await procesar(data.locations); } catch (e) { console.warn("[gps] tarea", e); }
});
