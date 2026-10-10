import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";
import { llamarApi } from "./api";

const CLAVE_TOKEN = "tdl-push-token";
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
  await explicar();
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Registra el token Expo de este dispositivo en la central. Solo en dispositivo físico; nunca lanza. */
export async function registrarPush(): Promise<void> {
  try {
    if (!(await pedirPermisoNotificaciones())) return;
    if (!Device.isDevice) return; // simulador/emulador: sin token de push
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const r = await llamarApi("/api/conductor/push-token", { method: "POST", body: { token, plataforma: Platform.OS === "ios" ? "ios" : "android" } });
    if (r.ok) await AsyncStorage.setItem(CLAVE_TOKEN, token);
  } catch (e) {
    console.warn("No se pudo registrar el dispositivo para avisos", e);
  }
}

/** Al salir: da de baja el token (con la sesión aún válida). Nunca lanza. */
export async function darDeBajaPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(CLAVE_TOKEN);
    if (!token) return;
    await AsyncStorage.removeItem(CLAVE_TOKEN);
    await llamarApi("/api/conductor/push-token", { method: "DELETE", body: { token } });
  } catch { /* sin red: el backend limpia los tokens caducados */ }
}

/** Notificación local inmediata (avisos de proximidad). */
export async function notificarLocal(titulo: string, cuerpo: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: cuerpo, sound: "default" },
      trigger: Platform.OS === "android" ? { channelId: CANAL_SERVICIOS } : null,
    });
  } catch { /* sin permiso: queda el banner y la vibración */ }
}

export type DatosPush = { tipo?: string; servicioId?: string };
