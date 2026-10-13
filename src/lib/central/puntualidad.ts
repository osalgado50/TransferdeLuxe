import type { SupabaseClient } from "@supabase/supabase-js";
import { rangosConductor } from "@/lib/dominio/dias";
import { indicadoresPuntualidad, type IndicadorPuntualidad, type ServicioPuntualidad } from "@/lib/dominio/puntualidadCentral";

const CAMPOS = "id,estado,conductor_id,fecha_hora_recogida,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng,origen_texto,destino_texto";
const ACTIVOS = ["asignado", "aceptado", "en_camino", "recogido"];

/**
 * Semáforo de puntualidad de los servicios de hoy (servidor): una consulta de los activos de hoy (y lo que siga en curso
 * desde la madrugada), posiciones y umbral «sin señal». Sin OSRM: modelo de traslado. Si algo falla, vacío (no tumba la página).
 * `conductorId`: solo los de ese conductor (ficha del servicio).
 */
export async function indicadoresHoy(sb: SupabaseClient, ahora = new Date(), conductorId?: string): Promise<Record<string, IndicadorPuntualidad>> {
  try {
    const { hoy } = rangosConductor(ahora);
    let q = sb.from("servicios").select(CAMPOS).eq("es_prueba", false).in("estado", ACTIVOS)
      .gte("fecha_hora_recogida", new Date(Date.parse(hoy.desde) - 12 * 3600e3).toISOString()).lt("fecha_hora_recogida", hoy.hasta).limit(1000);
    if (conductorId) q = q.eq("conductor_id", conductorId);
    let qp = sb.from("posicion_actual").select("conductor_id,lat,lng,en_servicio,registrado_en");
    if (conductorId) qp = qp.eq("conductor_id", conductorId);
    const [s, p, a] = await Promise.all([q, qp, sb.from("ajustes").select("umbral_sin_senal_min").eq("id", 1).maybeSingle()]);
    if (s.error || p.error) throw new Error((s.error ?? p.error)!.message);
    return indicadoresPuntualidad({ servicios: (s.data ?? []) as ServicioPuntualidad[], posiciones: p.data ?? [], ahora, umbralGpsMin: a.data?.umbral_sin_senal_min ?? 5 });
  } catch (e) {
    console.error("[central] puntualidad:", e instanceof Error ? e.message : e);
    return {};
  }
}
