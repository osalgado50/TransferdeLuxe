import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Vibration } from "react-native";
import { registrarPush, yaAnunciadoLocal, type DatosPush } from "~/lib/push";

/**
 * Registra el dispositivo para avisos y abre «Hoy» al tocar un aviso de servicio nuevo (allí sale el modal).
 * En modo central (operador) cualquier aviso tocado abre la pestaña «Central».
 */
export function AvisosPush({ yo, central }: { yo: string; central?: boolean }) {
  // Registro al iniciar sesión (forzado) y al volver a primer plano (como mucho cada 6 h si el token no cambia).
  useEffect(() => {
    void registrarPush(true);
    const app = AppState.addEventListener("change", (e) => { if (e === "active") void registrarPush(); });
    return () => { app.remove(); };
  }, [yo]);
  // Central con la app abierta: los push del servidor (incidencia, checklist, rechazo…) ya suenan por el handler;
  // además, vibración distinta según la gravedad. Los avisos locales vibran por su cuenta (AlertasSonoras).
  useEffect(() => {
    if (!central) return;
    const sus = Notifications.addNotificationReceivedListener((n) => {
      const d = n.request.content.data as DatosPush | undefined;
      if (d?.local || yaAnunciadoLocal(d)) return;
      const grave = d?.tipo === "incidencia" || d?.tipo === "checklist" || d?.tipo === "rechazado" || d?.tipo === "expirado";
      Vibration.vibrate(grave ? [0, 250, 120, 250, 120, 250] : [0, 400]);
      void Haptics.notificationAsync(grave ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    });
    return () => sus.remove();
  }, [central]);
  const ultima = Notifications.useLastNotificationResponse();
  const atendida = useRef<string | null>(null);
  useEffect(() => {
    if (!ultima || ultima.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = ultima.notification.request.identifier;
    if (atendida.current === id) return;
    atendida.current = id;
    const d = ultima.notification.request.content.data as DatosPush | undefined;
    if (central) router.navigate(d?.tipo === "servicio_nuevo" ? "/central/mis" : "/central");
    else if (d?.tipo === "servicio_nuevo") router.navigate("/");
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [ultima, central]);
  return null;
}
