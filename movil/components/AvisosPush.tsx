import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Vibration } from "react-native";
import { registrarPush, yaAnunciadoLocal, type DatosPush } from "~/lib/push";
import { refrescarTodo } from "~/lib/tiempoReal";

/** Avisos que cambian los servicios del conductor sin que Realtime se lo traiga (o antes de que llegue). */
const RECARGAN = new Set(["servicio_retirado", "servicio_modificado", "servicio_relevo", "servicio_nuevo", "recogida_reajustada"]);

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
      const grave = d?.grave || d?.tipo === "cierre_mantenimiento" || d?.tipo === "incidencia" || d?.tipo === "checklist" || d?.tipo === "rechazado" || d?.tipo === "expirado";
      Vibration.vibrate(grave ? [0, 250, 120, 250, 120, 250] : [0, 400]);
      void Haptics.notificationAsync(grave ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    });
    return () => sus.remove();
  }, [central]);
  // Con la app abierta: la central le quita, cambia o pasa un servicio → todas las pantallas recargan al momento
  // (si estaba en la ficha de un servicio que ya no es suyo, la ficha lo dice al recargar).
  useEffect(() => {
    const sus = Notifications.addNotificationReceivedListener((n) => {
      const d = n.request.content.data as DatosPush | undefined;
      if (d?.tipo && RECARGAN.has(d.tipo)) refrescarTodo();
    });
    return () => sus.remove();
  }, []);
  const ultima = Notifications.useLastNotificationResponse();
  const atendida = useRef<string | null>(null);
  useEffect(() => {
    if (!ultima || ultima.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = ultima.notification.request.identifier;
    if (atendida.current === id) return;
    atendida.current = id;
    const d = ultima.notification.request.content.data as DatosPush | undefined;
    if (central) router.navigate(d?.tipo === "servicio_nuevo" ? "/central/mis" : "/central");
    else if (d?.tipo === "servicio_nuevo" || d?.tipo === "servicio_retirado") { refrescarTodo(); router.navigate("/"); }
    else if ((d?.tipo === "servicio_modificado" || d?.tipo === "servicio_relevo") && d.servicioId) { refrescarTodo(); router.navigate(`/servicio/${d.servicioId}`); }
    else if (d?.tipo === "turno") router.navigate("/jornada"); // recordatorio de inicio de turno
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [ultima, central]);
  return null;
}
