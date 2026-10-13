import { sumarDias } from "@dominio/dias";
import { agruparHorarios, recordatoriosTurno } from "@dominio/horarios";
import { diaMadrid } from "@dominio/geo";
import { leerModulos } from "@dominio/modulos";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { alCambiarJornada } from "~/lib/jornada";
import { CANAL_SERVICIOS } from "~/lib/push";
import { supabase } from "~/lib/supabase";

const PREFIJO = "tdl-turno-";

/**
 * Recordatorio local 5 min antes de cada tramo de HOY si el conductor no ha iniciado la jornada (notificación local
 * programada con expo-notifications, sin nada nativo nuevo). Se reprograma al abrir la app, al volver a primer plano y
 * al cambiar la jornada: con la jornada abierta (o sin módulo de jornada, o sin horario) se cancelan todos.
 */
export function RecordatorioTurno({ yo }: { yo: string }) {
  useEffect(() => {
    let vivo = true;
    let enCurso = false;
    const revisar = async () => {
      if (enCurso) return;
      enCurso = true;
      try {
        const hoy = diaMadrid(new Date());
        const [hor, exc, jor, aj] = await Promise.all([
          supabase.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id").eq("conductor_id", yo),
          supabase.from("excepciones_horario").select("conductor_id,fecha,tramos,nota,vehiculo_id,tipo").eq("conductor_id", yo).gte("fecha", sumarDias(hoy, -1)).lte("fecha", hoy),
          supabase.from("jornadas").select("id").eq("conductor_id", yo).is("fin", null).limit(1),
          supabase.from("ajustes").select("modulos").eq("id", 1).maybeSingle(),
        ]);
        if (!vivo || hor.error || jor.error) return; // sin red o servidor sin tablas: se deja como estaba
        const abierta = (jor.data ?? []).length > 0;
        const quiero = abierta || !leerModulos(aj.data?.modulos).jornada ? []
          : recordatoriosTurno(agruparHorarios(hor.data ?? [], exc.error ? [] : exc.data ?? []).get(yo), Date.now());
        const ids = new Set(quiero.map((r) => PREFIJO + r.id));
        const programados = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(PREFIJO));
        for (const n of programados) if (!ids.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
        for (const r of quiero) {
          const id = PREFIJO + r.id;
          if (programados.some((n) => n.identifier === id)) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: id,
            content: { title: `Tu turno empieza a las ${r.tramo.inicio}`, body: "Aún no has iniciado la jornada. Abre la app y pulsa «Iniciar jornada».",
              sound: "default", data: { tipo: "turno" } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.cuando, ...(Platform.OS === "android" ? { channelId: CANAL_SERVICIOS } : {}) },
          }).catch(() => undefined); // sin permiso de notificaciones: nada
        }
      } catch { /* nunca rompe la app */ } finally { enCurso = false; }
    };
    void revisar();
    const quitar = alCambiarJornada(() => void revisar());
    const app = AppState.addEventListener("change", (e) => { if (e === "active") void revisar(); });
    return () => { vivo = false; quitar(); app.remove(); };
  }, [yo]);
  return null;
}
