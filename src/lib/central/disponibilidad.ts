import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import { cerradaHoy } from "@/lib/dominio/finJornada";
import type { Ausencia } from "@/lib/dominio/ausencias";
import { agruparHorarios, type HorarioConductor } from "@/lib/dominio/horarios";
import type { Punto } from "@/lib/dominio/tipos";

/**
 * Disponibilidad de los conductores para la sugerencia, la asignación automática y la asignación manual: ausencias que
 * tocan el rango de días y quién ha cerrado ya la jornada hoy. Si algo falla, devuelve vacío (nunca bloquea asignar).
 */
export interface Disponibilidad {
  ausencias: Ausencia[]; cerradasHoy: Set<string>; hoy: string;
  /** Horarios (semana tipo + excepciones del rango) por conductor; sin entrada = sin horario (disponible todo el día). */
  horarios: Map<string, HorarioConductor>;
  /** Base / depósito (ajustes.base_*): el coche sale de ella y vuelve a ella en cada tramo. */
  base: Punto | null;
}

/** Horarios de todos los conductores (semana tipo + excepciones de esos días) y la base. Si falla: vacío (nunca bloquea). */
export async function cargarHorarios(sb: SupabaseClient, desdeDia: string, hastaDia: string): Promise<{ horarios: Map<string, HorarioConductor>; base: Punto | null }> {
  try {
    const [h, e, a] = await Promise.all([
      sb.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id,plantilla_id").limit(5000),
      sb.from("excepciones_horario").select("conductor_id,fecha,tramos,nota").gte("fecha", desdeDia).lte("fecha", hastaDia).limit(5000),
      sb.from("ajustes").select("base_lat,base_lng").eq("id", 1).maybeSingle(),
    ]);
    for (const x of [h, e, a]) if (x.error) console.error("[disponibilidad] horarios:", x.error.message);
    const aj = a.data as { base_lat: number | null; base_lng: number | null } | null;
    return {
      horarios: agruparHorarios(h.error ? [] : h.data ?? [], e.error ? [] : e.data ?? []),
      base: aj?.base_lat != null && aj?.base_lng != null ? { lat: aj.base_lat, lng: aj.base_lng } : null,
    };
  } catch (err) {
    console.error("[disponibilidad] horarios:", err instanceof Error ? err.message : err);
    return { horarios: new Map(), base: null };
  }
}

export async function cargarDisponibilidad(sb: SupabaseClient, desdeDia: string, hastaDia: string, ahora = new Date()): Promise<Disponibilidad> {
  const hoy = diaMadrid(ahora);
  try {
    const [a, j, hz] = await Promise.all([
      sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").lte("desde", hastaDia).gte("hasta", desdeDia).limit(2000),
      sb.from("jornadas").select("conductor_id,fin").or(`fin.is.null,fin.gte.${madridAUtc(hoy, "00:00")}`).lt("inicio", madridAUtc(sumarDias(hoy, 1), "00:00")).limit(1000),
      cargarHorarios(sb, desdeDia, hastaDia),
    ]);
    if (a.error) console.error("[disponibilidad] ausencias:", a.error.message);
    if (j.error) console.error("[disponibilidad] jornadas:", j.error.message);
    return { ausencias: (a.data ?? []) as Ausencia[], cerradasHoy: cerradaHoy((j.data ?? []) as { conductor_id: string; fin: string | null }[], ahora), hoy, ...hz };
  } catch (e) {
    console.error("[disponibilidad]", e instanceof Error ? e.message : e);
    return { ausencias: [], cerradasHoy: new Set(), hoy, horarios: new Map(), base: null };
  }
}

/** Campos para Candidato / ConductorAuto. */
export const disponibilidadDe = (d: Disponibilidad, conductorId: string) => ({
  ausencias: d.ausencias.filter((a) => a.conductor_id === conductorId),
  jornadaCerradaDia: d.cerradasHoy.has(conductorId) ? d.hoy : null,
  horario: d.horarios.get(conductorId) ?? null,
});
