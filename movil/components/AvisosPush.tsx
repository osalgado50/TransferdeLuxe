import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { registrarPush, type DatosPush } from "~/lib/push";

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
