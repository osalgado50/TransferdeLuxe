import { textoAlertaCentral } from "@dominio/centralMovil";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Vibration } from "react-native";
import { useCentral, type ServicioCentral } from "~/lib/central";
import { avisoLocal } from "~/lib/push";

/** Tipo de aviso de una alerta de la central (coincide con el `tipo` de los push del vigilante para no duplicarlos). */
function tipoAlerta(s: ServicioCentral): { tipo: string; grave: boolean } {
  const inc = s.ultima_incidencia ?? "";
  if (inc.startsWith("rechazado")) return { tipo: "rechazado", grave: true };
  if (inc === "expirado") return { tipo: "expirado", grave: true };
  if (s.subcontratar && s.estado === "pendiente") return { tipo: "subcontratar", grave: true };
  if (inc === "nuevo") return { tipo: "reserva_nueva", grave: false };
  return { tipo: "alerta", grave: true };
}

/**
 * Modo central con la app abierta: cada alerta NUEVA (rechazo, plazo vencido, subcontratar, reserva web) lanza una
 * notificación local con sonido y una vibración distinta (Error para lo grave, Warning para la reserva nueva).
 * Las alertas que ya había al abrir la app no suenan. Las incidencias y checklists llegan por push (ver AvisosPush).
 */
export function AlertasSonoras() {
  const { datos } = useCentral();
  const vistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!datos) return;
    const nombres = new Map(datos.conductores.map((c) => [c.id, c.nombre]));
    const nombre = (id: string | null) => (id && nombres.get(id)) || "conductor";
    const claves = new Map(datos.alertas.map((s) => [`${s.id}|${s.ultima_incidencia ?? ""}|${s.subcontratar}`, s]));
    const antes = vistas.current;
    vistas.current = new Set(claves.keys());
    if (!antes) return;
    const nuevas = [...claves].filter(([k]) => !antes.has(k)).map(([, s]) => s);
    if (!nuevas.length) return;
    const grave = nuevas.some((s) => tipoAlerta(s).grave);
    Vibration.vibrate(grave ? [0, 250, 120, 250, 120, 250] : [0, 400]);
    void Haptics.notificationAsync(grave ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    for (const s of nuevas.slice(0, 3)) {
      const a = textoAlertaCentral(s, nombre);
      void avisoLocal(`alerta-${s.id}`, a.titulo, a.texto, { tipo: tipoAlerta(s).tipo, servicioId: s.id });
    }
  }, [datos]);
  return null;
}
