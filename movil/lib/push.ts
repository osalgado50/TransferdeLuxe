import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";
import { llamarApi } from "./api";

const CLAVE_TOKEN = "tdl-push-token";
const CLAVE_EXPLICADO = "tdl-push-explicado";
export const CANAL_SERVICIOS = "servicios";

// Con la app abierta también se muestra el banner (y suena).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function canalAndroid() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL_SERVICIOS, {
    name: "Servicios", importance: Notifications.AndroidImportance.HIGH, sound: "default", vibrationPattern: [0, 300, 150, 300],
  });
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

export type DatosPush = { tipo?: string; servicioId?: string };
