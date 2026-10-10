// Control del GPS en servicio: permisos, arranque/parada de la tarea y estado persistido por conductor.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Permiso } from "@dominio/gpsNativo";
import * as Location from "expo-location";
import { API_URL } from "./config";
import { CLAVE_ULTIMO_ENVIO, TAREA_GPS, vaciarColaGps } from "./gpsTarea";
import { supabase } from "./supabase";

const claveOn = (conductorId: string) => `tvl:gps:on:${conductorId}`;

export async function leerEnServicio(conductorId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(claveOn(conductorId)).catch(() => null)) === "1";
}
export const guardarEnServicio = (conductorId: string, on: boolean) =>
  on ? AsyncStorage.setItem(claveOn(conductorId), "1") : AsyncStorage.removeItem(claveOn(conductorId));

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
    distanceInterval: 25,
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

export async function pararGps(): Promise<void> {
  if (await tareaCorriendo()) await Location.stopLocationUpdatesAsync(TAREA_GPS).catch(() => undefined);
  await vaciarColaGps().catch(() => undefined);
  await AsyncStorage.removeItem(CLAVE_ULTIMO_ENVIO).catch(() => undefined);
}

/** POST /api/conductor/fuera-de-servicio con el JWT (best effort: si falla, la central lo verá por inactividad). */
export async function marcarFueraDeServicio(): Promise<boolean> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return false;
    const r = await fetch(`${API_URL}/api/conductor/fuera-de-servicio`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return r.ok;
  } catch { return false; }
}
