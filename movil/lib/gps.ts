// Control del GPS en servicio: permisos, arranque/parada de la tarea y estado persistido por conductor.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { alEncender, alIniciar, claveOn, type EstadoInterruptor, type Permiso } from "@dominio/gpsNativo";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { fetchConTiempo } from "./api";
import { API_URL } from "./config";
import { TAREA_GPS, esperarLoteEnCurso, limpiarDatosGps } from "./gpsTarea";
import { avisarCambioGps } from "./jornada";
import { supabase } from "./supabase";

export async function leerEnServicio(conductorId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(claveOn(conductorId)).catch(() => null)) !== null;
}
/** ON guarda una generación nueva: un lote que empezó con otra (o con OFF de por medio) se descarta. */
export const guardarEnServicio = (conductorId: string, on: boolean) =>
  on ? AsyncStorage.setItem(claveOn(conductorId), Crypto.randomUUID()) : AsyncStorage.removeItem(claveOn(conductorId));

export async function permisosActuales(): Promise<{ primerPlano: Permiso; fondo: Permiso }> {
  const [a, b] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
  return { primerPlano: a.status as Permiso, fondo: b.status as Permiso };
}
export const pedirPrimerPlano = async () => (await Location.requestForegroundPermissionsAsync()).status as Permiso;
export const pedirFondo = async () => (await Location.requestBackgroundPermissionsAsync()).status as Permiso;

export const tareaCorriendo = () => Location.hasStartedLocationUpdatesAsync(TAREA_GPS).catch(() => false);

export async function arrancarGps(): Promise<void> {
  if (await tareaCorriendo()) return;
  await Location.startLocationUpdatesAsync(TAREA_GPS, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000,
    // 0: también con el coche parado (si no, la central lo marca «sin señal» a los 5 min). La tarea limita a 1 envío / 12 s.
    distanceInterval: 0,
    deferredUpdatesInterval: 15_000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: "TVL Conductor",
      notificationBody: "Compartiendo tu ubicación con la central",
      notificationColor: "#2a75a8",
      killServiceOnDestroy: false,
    },
  });
}

/** Apaga: quita el flag (los lotes en vuelo se descartan), espera al lote en curso, para la tarea y limpia la cola. */
export async function pararGps(conductorId: string): Promise<void> {
  await guardarEnServicio(conductorId, false).catch(() => undefined);
  await esperarLoteEnCurso();
  if (await tareaCorriendo()) await Location.stopLocationUpdatesAsync(TAREA_GPS).catch(() => undefined);
  await limpiarDatosGps(conductorId).catch(() => undefined);
}

/** POST /api/conductor/fuera-de-servicio con el JWT (best effort: si falla, la central lo verá por inactividad). */
export async function marcarFueraDeServicio(): Promise<boolean> {
  return (await postFuera()) || (await postFuera()); // un reintento
}
async function postFuera(): Promise<boolean> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return false;
    const r = await fetchConTiempo(`${API_URL}/api/conductor/fuera-de-servicio`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return r.ok;
  } catch { return false; }
}

// ── Encender / apagar «En servicio» (interruptor de la cabecera y pantalla Jornada: mismo almacenamiento y mismo flujo) ──

/** Estado actual sin tocar nada (para mostrarlo): flag persistido + permisos. */
export async function estadoGps(conductorId: string): Promise<EstadoInterruptor> {
  const [on, corriendo, p] = await Promise.all([leerEnServicio(conductorId), tareaCorriendo(), permisosActuales()]);
  return alIniciar(on, corriendo, p.primerPlano, p.fondo).estado;
}

/**
 * Pide permisos y arranca el GPS. `explicar` muestra la pantalla «Ubicación Siempre» antes del diálogo del sistema y
 * resuelve true si el conductor pulsa «Continuar» (se pide «Siempre») o false («Ahora no»: solo con la app abierta).
 * Sin permiso de ubicación devuelve el error y NO enciende.
 */
export async function encenderServicio(conductorId: string, explicar: () => Promise<boolean>): Promise<{ estado: EstadoInterruptor; error?: string }> {
  const pp = await pedirPrimerPlano(); // iOS exige «Mientras se usa» antes de «Siempre»
  const r0 = alEncender(pp, "undetermined");
  if (r0.error) return r0;
  let { fondo } = await permisosActuales();
  if (fondo !== "granted" && (await explicar())) fondo = await pedirFondo();
  const r = alEncender((await permisosActuales()).primerPlano, fondo);
  if (r.error) return r;
  try {
    await arrancarGps();
    await guardarEnServicio(conductorId, true);
  } catch (e) { return { estado: "fuera", error: `No se pudo arrancar el GPS: ${(e as Error).message}` }; }
  avisarCambioGps();
  return r;
}

/** Apaga el GPS y avisa a la central de «Fuera de servicio». Devuelve false si no se pudo avisar (se apaga igualmente). */
export async function apagarServicio(conductorId: string): Promise<boolean> {
  await pararGps(conductorId);
  avisarCambioGps();
  return marcarFueraDeServicio();
}
