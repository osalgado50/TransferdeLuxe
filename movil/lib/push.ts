import { NOMBRE_CANAL, SONIDOS_PUSH, sonidoDeAviso } from "@dominio/sonidoPush";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";
import { llamarApi } from "./api";

const CLAVE_TOKEN = "tdl-push-token";
const CLAVE_EXPLICADO = "tdl-push-explicado";
export const CANAL_SERVICIOS = "servicios";

// ── Avisos ya anunciados (para no sonar dos veces por lo mismo: aviso local inmediato + push del servidor) ──
const anunciados = new Map<string, { local: number; remoto: number }>();
// Una incidencia se identifica por su id (el push del servidor y el aviso local de la app llevan el mismo).
const claveAviso = (d: DatosPush | undefined) => {
  const ref = d?.incidenciaId ?? d?.cierreId ?? d?.servicioId;
  return d?.tipo && ref ? `${d.tipo}:${ref}` : null;
};
function anotar(clave: string, campo: "local" | "remoto") {
  const a = anunciados.get(clave) ?? { local: 0, remoto: 0 };
  a[campo] = Date.now();
  anunciados.set(clave, a);
  if (anunciados.size > 200) anunciados.delete(anunciados.keys().next().value!);
}
const reciente = (clave: string | null, campo: "local" | "remoto", ms: number) =>
  !!clave && Date.now() - (anunciados.get(clave)?.[campo] ?? 0) < ms;

/** ¿La app ya anunció esto con un aviso local hace poco? (el push del servidor llega hasta 20 s después). */
export const yaAnunciadoLocal = (d: DatosPush | undefined) => !d?.local && reciente(claveAviso(d), "local", 90_000);

// Con la app abierta también se muestra el banner y suena (prioridad máxima en Android). Excepción: un push del
// servidor de algo que la app ya acaba de anunciar con su aviso local (llega hasta 20 s después) solo va a la lista.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const d = n.request.content.data as DatosPush | undefined;
    const clave = claveAviso(d);
    const repetido = yaAnunciadoLocal(d);
    if (!d?.local && clave) anotar(clave, "remoto");
    // Servicio nuevo con la app abierta: la pantalla del servicio ya lo enseña a pantalla completa; el banner la
    // taparía (la cuenta atrás). Suena y vibra igual, y queda en la lista de notificaciones.
    const enPantalla = d?.tipo === "servicio_nuevo";
    return {
      shouldShowBanner: !repetido && !enPantalla, shouldShowList: true, shouldPlaySound: !repetido, shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    };
  },
});

async function canalAndroid() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL_SERVICIOS, {
    name: "Servicios", importance: Notifications.AndroidImportance.HIGH, sound: "default", vibrationPattern: [0, 300, 150, 300],
  });
  // Un canal por sonido propio (Android fija el sonido al crear el canal). Ficheros en assets/sonidos.
  for (const s of SONIDOS_PUSH) {
    await Notifications.setNotificationChannelAsync(s, {
      name: NOMBRE_CANAL[s], importance: s === "aceptado" ? Notifications.AndroidImportance.DEFAULT : Notifications.AndroidImportance.MAX,
      sound: `${s}.wav`, vibrationPattern: s === "alarma" ? [0, 600, 200, 600, 200, 600] : [0, 300, 150, 300],
      bypassDnd: s === "alarma",
    });
  }
}

/** Sonido (iOS: fichero) y canal (Android) de una notificación local según su tipo. */
function sonidoLocal(datos: DatosPush & { grave?: boolean }): { sound: string; channelId: string } {
  const s = sonidoDeAviso(datos);
  return s ? { sound: `${s}.wav`, channelId: s } : { sound: "default", channelId: CANAL_SERVICIOS };
}

const explicar = () => new Promise<void>((ok) =>
  Alert.alert("Avisos de servicios", "Activa las notificaciones para enterarte al momento cuando la central te asigne un servicio y cuando llegues a la recogida o al destino.",
    [{ text: "Continuar", onPress: () => ok() }], { cancelable: false }));

/** Permiso de notificaciones (con explicación previa la primera vez). */
export async function pedirPermisoNotificaciones(): Promise<boolean> {
  await canalAndroid().catch(() => undefined);
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  if (!actual.canAskAgain) return false;
  // La explicación solo se muestra una vez (luego el SO decide si puede volver a preguntar).
  if (!(await AsyncStorage.getItem(CLAVE_EXPLICADO).catch(() => null))) {
    await explicar();
    await AsyncStorage.setItem(CLAVE_EXPLICADO, "1").catch(() => undefined);
  }
  return (await Notifications.requestPermissionsAsync()).granted;
}

const CLAVE_REGISTRO = "tvl:push:registrado-en";
const REGISTRO_CADA_MS = 6 * 3600_000; // re-registro como mucho cada 6 h (el upsert es idempotente)
let registrando: Promise<void> | null = null;

/**
 * Registra el token Expo de este dispositivo en la central. Solo en dispositivo físico; nunca lanza.
 * Una sola llamada a la vez y, si el token no ha cambiado, como mucho una vez cada 6 h.
 * Ojo: NO escuchar addPushTokenListener para re-registrar: getExpoPushTokenAsync lo dispara y se formaba
 * un bucle infinito (decenas de llamadas por segundo, móvil caliente y servidor saturado).
 */
export function registrarPush(forzar = false): Promise<void> {
  registrando ??= (async () => {
    try {
      if (!(await pedirPermisoNotificaciones())) return;
      if (!Device.isDevice) return; // simulador/emulador: sin token de push
      const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
      if (!projectId) return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      const [previo, cuando] = await Promise.all([AsyncStorage.getItem(CLAVE_TOKEN), AsyncStorage.getItem(CLAVE_REGISTRO)]);
      if (!forzar && previo === token && cuando && Date.now() - Number(cuando) < REGISTRO_CADA_MS) return;
      const r = await llamarApi("/api/conductor/push-token", { method: "POST", body: { token, plataforma: Platform.OS === "ios" ? "ios" : "android" } });
      if (r.ok) await AsyncStorage.multiSet([[CLAVE_TOKEN, token], [CLAVE_REGISTRO, String(Date.now())]]);
    } catch (e) {
      console.warn("No se pudo registrar el dispositivo para avisos", e);
    }
  })().finally(() => { registrando = null; });
  return registrando;
}

/** Al salir: da de baja el token (con la sesión aún válida). Nunca lanza. */
export async function darDeBajaPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(CLAVE_TOKEN);
    if (!token) return;
    await AsyncStorage.multiRemove([CLAVE_TOKEN, CLAVE_REGISTRO]);
    await llamarApi("/api/conductor/push-token", { method: "DELETE", body: { token } });
  } catch { /* sin red: el backend limpia los tokens caducados */ }
}

/** Notificación local inmediata (avisos de proximidad). */
export async function notificarLocal(titulo: string, cuerpo: string): Promise<void> {
  try {
    await canalAndroid().catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: cuerpo, sound: "default" },
      trigger: Platform.OS === "android" ? { channelId: CANAL_SERVICIOS } : null,
    });
  } catch { /* sin permiso: queda el banner y la vibración */ }
}

export type DatosPush = { tipo?: string; servicioId?: string; incidenciaId?: string; cierreId?: string; grave?: boolean; local?: boolean };

/**
 * Aviso local con sonido (canal de alta importancia en Android) para algo que la app acaba de detectar con la
 * pantalla abierta. `id` fija el identificador: repetirlo sustituye al anterior en la bandeja en vez de apilarlo.
 * Si el push del servidor de lo mismo acaba de sonar (`saltarSiPush`), no se repite el sonido.
 */
export async function avisoLocal(id: string, titulo: string, cuerpo: string, datos: DatosPush, saltarSiPush = true): Promise<void> {
  const clave = claveAviso(datos);
  if (saltarSiPush && reciente(clave, "remoto", 30_000)) return;
  if (clave) anotar(clave, "local");
  try {
    await canalAndroid().catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title: titulo, body: cuerpo, sound: sonidoLocal(datos).sound, data: { ...datos, local: true }, priority: Notifications.AndroidNotificationPriority.MAX },
      trigger: Platform.OS === "android" ? { channelId: sonidoLocal(datos).channelId } : null,
    });
  } catch { /* sin permiso: queda lo que se ve en pantalla y la vibración */ }
}

export function quitarAviso(id: string): void {
  void Notifications.dismissNotificationAsync(id).catch(() => undefined);
}

/**
 * Aviso insistente: suena ya y se repite cada `cadaMs` (máx. `veces` en total) mientras `sigue()` sea cierto,
 * con `alRepetir` en cada repetición (p. ej. vibración fuerte). Devuelve la parada (también quita el aviso).
 */
export function avisoInsistente(o: {
  id: string; titulo: string; cuerpo: () => string; datos: DatosPush; sigue: () => boolean; alRepetir?: () => void; veces?: number; cadaMs?: number;
}): () => void {
  const { veces = 5, cadaMs = 20_000 } = o;
  let n = 1;
  void avisoLocal(o.id, o.titulo, o.cuerpo(), o.datos);
  const t = setInterval(() => {
    if (n >= veces) { clearInterval(t); return; }
    if (!o.sigue()) return; // p. ej. está escribiendo el motivo del rechazo: no insistir (pero tampoco gastar repeticiones)
    n++;
    o.alRepetir?.();
    // Quitar el anterior antes de volver a lanzarlo: así vuelve a sonar seguro (no se «actualiza» en silencio).
    void Notifications.dismissNotificationAsync(o.id).catch(() => undefined)
      .then(() => avisoLocal(o.id, o.titulo, o.cuerpo(), o.datos, false));
  }, cadaMs);
  return () => { clearInterval(t); quitarAviso(o.id); };
}
