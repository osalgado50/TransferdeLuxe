import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { escucharRotacionToken, registrarPush, type DatosPush } from "~/lib/push";

/** Registra el dispositivo para avisos y abre «Hoy» al tocar un aviso de servicio nuevo (allí sale el modal). */
export function AvisosPush({ yo }: { yo: string }) {
  // Re-registro idempotente al iniciar sesión, al volver a primer plano y si el token rota.
  useEffect(() => {
    void registrarPush();
    const rotacion = escucharRotacionToken();
    const app = AppState.addEventListener("change", (e) => { if (e === "active") void registrarPush(); });
    return () => { rotacion.remove(); app.remove(); };
  }, [yo]);
  const ultima = Notifications.useLastNotificationResponse();
  const atendida = useRef<string | null>(null);
  useEffect(() => {
    if (!ultima || ultima.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = ultima.notification.request.identifier;
    if (atendida.current === id) return;
    atendida.current = id;
    const d = ultima.notification.request.content.data as DatosPush | undefined;
    if (d?.tipo === "servicio_nuevo") router.navigate("/");
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [ultima]);
  return null;
}
