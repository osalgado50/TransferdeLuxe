import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import { cerradaHoy } from "@/lib/dominio/finJornada";
import type { Ausencia } from "@/lib/dominio/ausencias";

/**
 * Disponibilidad de los conductores para la sugerencia, la asignación automática y la asignación manual: ausencias que
 * tocan el rango de días y quién ha cerrado ya la jornada hoy. Si algo falla, devuelve vacío (nunca bloquea asignar).
 */
export interface Disponibilidad { ausencias: Ausencia[]; cerradasHoy: Set<string>; hoy: string }

export async function cargarDisponibilidad(sb: SupabaseClient, desdeDia: string, hastaDia: string, ahora = new Date()): Promise<Disponibilidad> {
  const hoy = diaMadrid(ahora);
  try {
    const [a, j] = await Promise.all([
      sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").lte("desde", hastaDia).gte("hasta", desdeDia).limit(2000),
      sb.from("jornadas").select("conductor_id,fin").or(`fin.is.null,fin.gte.${madridAUtc(hoy, "00:00")}`).lt("inicio", madridAUtc(sumarDias(hoy, 1), "00:00")).limit(1000),
    ]);
    if (a.error) console.error("[disponibilidad] ausencias:", a.error.message);
    if (j.error) console.error("[disponibilidad] jornadas:", j.error.message);
    return { ausencias: (a.data ?? []) as Ausencia[], cerradasHoy: cerradaHoy((j.data ?? []) as { conductor_id: string; fin: string | null }[], ahora), hoy };
  } catch (e) {
    console.error("[disponibilidad]", e instanceof Error ? e.message : e);
    return { ausencias: [], cerradasHoy: new Set(), hoy };
  }
}

/** Campos para Candidato / ConductorAuto. */
export const disponibilidadDe = (d: Disponibilidad, conductorId: string) => ({
  ausencias: d.ausencias.filter((a) => a.conductor_id === conductorId),
  jornadaCerradaDia: d.cerradasHoy.has(conductorId) ? d.hoy : null,
});
