"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { agruparHorarios, DIAS_SEMANA, NOMBRE_DIA, validarTramos, type HorarioConductor, type Tramo } from "@/lib/dominio/horarios";
import { diaMadrid } from "@/lib/dominio/geo";
import { sumarDias } from "@/lib/dominio/dias";
import { diasDelMes, esMes, nombreMes, planCopiarMeses, planRepetirSemanas, type DiaPlan } from "@/lib/dominio/planHorarios";
import { leerTodasLasPaginas } from "@/lib/dominio/paginar";

/** Horarios de los conductores: semana tipo, plantillas y excepciones de un día (solo la central). */
export type Resultado = { ok: true; mensaje: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const refrescar = () => { revalidatePath("/central/horarios"); revalidatePath("/central", "layout"); };

async function existeConductor(id: string): Promise<boolean> {
  const { data } = await clienteAdmin().from("perfiles").select("id").eq("id", id).maybeSingle();
  return !!data;
}

export interface DiaEntrada { dia_semana: number; tramos: Tramo[]; vehiculo_id: string | null; plantilla_id: string | null }

/** Guarda la semana tipo completa (7 días; tramos [] = libre ese día). */
export async function guardarSemana(conductorId: string, dias: DiaEntrada[]): Promise<Resultado> {
  await exigirRol("operador");
  if (!uuid.safeParse(conductorId).success || !(await existeConductor(conductorId))) return { ok: false, error: "Conductor no válido." };
  if (!Array.isArray(dias) || dias.length !== 7) return { ok: false, error: "Faltan días de la semana." };
  const filas = [];
  for (const dia of DIAS_SEMANA) {
    const d = dias.find((x) => x?.dia_semana === dia);
    if (!d) return { ok: false, error: "Faltan días de la semana." };
    const v = validarTramos(d.tramos);
    if (!v.ok) return { ok: false, error: `${NOMBRE_DIA[dia]}: ${v.error}` };
    const vehiculo_id = d.vehiculo_id && uuid.safeParse(d.vehiculo_id).success ? d.vehiculo_id : null;
    const plantilla_id = d.plantilla_id && uuid.safeParse(d.plantilla_id).success ? d.plantilla_id : null;
    filas.push({ conductor_id: conductorId, dia_semana: dia, tramos: v.tramos, vehiculo_id, plantilla_id, actualizado_en: new Date().toISOString() });
  }
  const { error } = await clienteAdmin().from("horarios_conductor").upsert(filas, { onConflict: "conductor_id,dia_semana" });
  if (error) return { ok: false, error: error.code === "23503" ? "El vehículo o la plantilla ya no existe." : "No se pudo guardar el horario." };
  refrescar();
  return { ok: true, mensaje: "Horario guardado." };
}

/** Quita la semana tipo: el conductor vuelve a estar disponible todo el día (las excepciones se mantienen). */
export async function quitarHorario(conductorId: string): Promise<Resultado> {
  await exigirRol("operador");
  if (!uuid.safeParse(conductorId).success) return { ok: false, error: "Conductor no válido." };
  const { error } = await clienteAdmin().from("horarios_conductor").delete().eq("conductor_id", conductorId);
  if (error) return { ok: false, error: "No se pudo quitar el horario." };
  refrescar();
  return { ok: true, mensaje: "Horario quitado: disponible todo el día." };
}

export async function guardarPlantilla(p: { id?: string | null; nombre: string; tramos: Tramo[] }): Promise<Resultado> {
  await exigirRol("operador");
  const nombre = typeof p?.nombre === "string" ? p.nombre.trim().slice(0, 60) : "";
  if (!nombre) return { ok: false, error: "Ponle un nombre a la plantilla." };
  const v = validarTramos(p.tramos);
  if (!v.ok) return v;
  if (!v.tramos.length) return { ok: false, error: "Añade al menos un tramo." };
  const sb = clienteAdmin();
  const { data, error } = p.id && uuid.safeParse(p.id).success
    ? await sb.from("plantillas_horario").update({ nombre, tramos: v.tramos }).eq("id", p.id).select("id")
    : await sb.from("plantillas_horario").insert({ nombre, tramos: v.tramos }).select("id");
  if (error || !data?.length) return { ok: false, error: "No se pudo guardar la plantilla." };
  refrescar();
  return { ok: true, mensaje: p.id ? "Plantilla actualizada." : "Plantilla creada." };
}

export async function borrarPlantilla(id: string): Promise<Resultado> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Plantilla no válida." };
  const { error } = await clienteAdmin().from("plantillas_horario").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar la plantilla." };
  refrescar();
  return { ok: true, mensaje: "Plantilla borrada (los horarios que la usaban se quedan como están)." };
}

/** Cambio de un día concreto (manda sobre la semana tipo); tramos [] = libre ese día. */
export async function guardarExcepcion(p: { conductor_id: string; fecha: string; tramos: Tramo[]; nota?: string }): Promise<Resultado> {
  await exigirRol("operador");
  if (!uuid.safeParse(p?.conductor_id).success || !(await existeConductor(p.conductor_id))) return { ok: false, error: "Elige el conductor." };
  if (!DIA.test(p.fecha ?? "") || Number.isNaN(Date.parse(p.fecha))) return { ok: false, error: "Indica la fecha." };
  const v = validarTramos(p.tramos);
  if (!v.ok) return v;
  const nota = typeof p.nota === "string" ? p.nota.trim().slice(0, 200) : "";
  const { error } = await clienteAdmin().from("excepciones_horario")
    .upsert({ conductor_id: p.conductor_id, fecha: p.fecha, tramos: v.tramos, nota, tipo: "cambio", vehiculo_id: null }, { onConflict: "conductor_id,fecha" });
  if (error) return { ok: false, error: "No se pudo guardar el cambio de ese día." };
  refrescar();
  return { ok: true, mensaje: "Cambio de horario guardado para ese día." };
}

export async function borrarExcepcion(conductorId: string, fecha: string): Promise<Resultado> {
  await exigirRol("operador");
  if (!uuid.safeParse(conductorId).success || !DIA.test(fecha ?? "")) return { ok: false, error: "Datos no válidos." };
  const { error } = await clienteAdmin().from("excepciones_horario").delete().eq("conductor_id", conductorId).eq("fecha", fecha);
  if (error) return { ok: false, error: "No se pudo borrar el cambio." };
  refrescar();
  return { ok: true, mensaje: "Cambio de ese día borrado: vuelve a su semana tipo." };
}

// ── Planificación por fechas (semanas, meses o todo el año): filas tipo «plan» que mandan sobre la semana tipo ──
const MAX_DIAS_ADELANTE = 800; // hasta ~2 años vista
const LOTE = 500;
const fmtDia = (d: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** Conductores válidos (los que existen) de la lista. */
async function conductoresValidos(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every((x) => uuid.safeParse(x).success)) return [];
  const { data } = await clienteAdmin().from("perfiles").select("id").in("id", ids as string[]);
  return (data ?? []).map((x: { id: string }) => x.id);
}

/** Horarios (semana tipo + días con fecha del rango) de esos conductores. */
async function horariosDe(ids: string[], desde: string, hasta: string): Promise<Map<string, HorarioConductor>> {
  const sb = clienteAdmin();
  // Excepciones paginadas (PostgREST corta en 1000 filas): si no, «copiar mes»/«repetir semanas» con un año planificado
  // no vería todos los cambios puntuales y podría pisarlos.
  const [h, e] = await Promise.all([
    sb.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id,plantilla_id").in("conductor_id", ids),
    leerTodasLasPaginas((a, b) => sb.from("excepciones_horario").select("conductor_id,fecha,tramos,nota,vehiculo_id,tipo").in("conductor_id", ids)
      .gte("fecha", desde).lte("fecha", hasta).order("conductor_id").order("fecha").range(a, b)).catch(() => null),
  ]);
  if (h.error || !e) throw new Error("No se pudieron leer los horarios.");
  return agruparHorarios(h.data ?? [], e);
}

/** Guarda días planificados (sustituye lo que hubiera esas fechas). */
async function escribirPlan(conductorId: string, dias: DiaPlan[]): Promise<string | null> {
  const filas = dias.map((d) => ({ conductor_id: conductorId, fecha: d.fecha, tramos: d.tramos, vehiculo_id: d.vehiculo_id, nota: "", tipo: "plan" }));
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await clienteAdmin().from("excepciones_horario").upsert(filas.slice(i, i + LOTE), { onConflict: "conductor_id,fecha" });
    if (error) return error.code === "23503" ? "El vehículo ya no existe." : "No se pudo guardar la planificación.";
  }
  return null;
}

/** Días planificados a mano (una semana concreta o un día del mes). Tramos [] = libre ese día. */
export async function guardarPlan(conductorId: string, dias: { fecha: string; tramos: Tramo[]; vehiculo_id: string | null }[]): Promise<Resultado> {
  await exigirRol("operador");
  if (!uuid.safeParse(conductorId).success || !(await existeConductor(conductorId))) return { ok: false, error: "Conductor no válido." };
  if (!Array.isArray(dias) || !dias.length || dias.length > 62) return { ok: false, error: "Días no válidos." };
  const limpio: DiaPlan[] = [];
  for (const d of dias) {
    if (!DIA.test(d?.fecha ?? "") || Number.isNaN(Date.parse(d.fecha))) return { ok: false, error: "Fecha no válida." };
    const v = validarTramos(d.tramos);
    if (!v.ok) return { ok: false, error: `${fmtDia(d.fecha)}: ${v.error}` };
    limpio.push({ fecha: d.fecha, tramos: v.tramos, vehiculo_id: d.vehiculo_id && uuid.safeParse(d.vehiculo_id).success ? d.vehiculo_id : null });
  }
  const err = await escribirPlan(conductorId, limpio);
  if (err) return { ok: false, error: err };
  refrescar();
  return { ok: true, mensaje: limpio.length === 1 ? `Horario del ${fmtDia(limpio[0].fecha)} guardado.` : `Planificados ${limpio.length} días (del ${fmtDia(limpio[0].fecha)} al ${fmtDia(limpio[limpio.length - 1].fecha)}).` };
}

/** Quita lo planificado (no los cambios puntuales) entre dos fechas: esos días vuelven a la semana tipo. */
export async function quitarPlan(conductorIds: string[], desde: string, hasta: string): Promise<Resultado> {
  await exigirRol("operador");
  const ids = await conductoresValidos(conductorIds);
  if (!ids.length || !DIA.test(desde ?? "") || !DIA.test(hasta ?? "") || hasta < desde) return { ok: false, error: "Datos no válidos." };
  const { error, count } = await clienteAdmin().from("excepciones_horario").delete({ count: "exact" })
    .in("conductor_id", ids).eq("tipo", "plan").gte("fecha", desde).lte("fecha", hasta);
  if (error) return { ok: false, error: "No se pudo quitar la planificación." };
  refrescar();
  return { ok: true, mensaje: `Quitados ${count ?? 0} días planificados: vuelven a la semana tipo.` };
}

/**
 * Copia el mes `mesOrigen` a los siguientes hasta `mesHasta` (mismo día de la semana, encadenado) para esos conductores.
 * No pisa los cambios puntuales; sí lo ya planificado en esos meses.
 */
export async function copiarMes(conductorIds: string[], mesOrigen: string, mesHasta: string): Promise<Resultado> {
  await exigirRol("operador");
  const ids = await conductoresValidos(conductorIds);
  if (!ids.length) return { ok: false, error: "Elige al menos un conductor." };
  if (!esMes(mesOrigen ?? "") || !esMes(mesHasta ?? "") || mesHasta <= mesOrigen) return { ok: false, error: "Elige hasta qué mes copiar." };
  const desde = `${mesOrigen}-01`, hasta = diasDelMes(mesHasta).at(-1)!;
  if (hasta > sumarDias(diaMadrid(new Date()), MAX_DIAS_ADELANTE)) return { ok: false, error: "Como mucho unos dos años vista." };
  let horarios: Map<string, HorarioConductor>;
  try { horarios = await horariosDe(ids, sumarDias(desde, -1), hasta); } catch (e) { return { ok: false, error: (e as Error).message }; }
  let total = 0, sinHorario = 0;
  for (const id of ids) {
    const dias = planCopiarMeses(horarios.get(id), mesOrigen, mesHasta);
    if (!dias.length) { sinHorario++; continue; }
    const err = await escribirPlan(id, dias);
    if (err) return { ok: false, error: err };
    total += dias.length;
  }
  refrescar();
  return { ok: true, mensaje: `Copiado ${nombreMes(mesOrigen)} hasta ${nombreMes(mesHasta)}: ${total} días planificados${sinHorario ? ` (${sinHorario} conductor(es) sin horario que copiar)` : ""}.` };
}

/** Repite el bloque de `semanas` semanas que empieza el lunes `lunes` hasta `hasta` (rotaciones). No pisa los cambios puntuales. */
export async function repetirSemanas(conductorIds: string[], lunes: string, semanas: number, hasta: string): Promise<Resultado> {
  await exigirRol("operador");
  const ids = await conductoresValidos(conductorIds);
  if (!ids.length) return { ok: false, error: "Elige al menos un conductor." };
  if (!DIA.test(lunes ?? "") || !DIA.test(hasta ?? "") || !Number.isInteger(semanas) || semanas < 1 || semanas > 8) return { ok: false, error: "Datos no válidos." };
  if (hasta < sumarDias(lunes, semanas * 7)) return { ok: false, error: "La fecha «hasta» debe ser posterior al bloque que se repite." };
  if (hasta > sumarDias(diaMadrid(new Date()), MAX_DIAS_ADELANTE)) return { ok: false, error: "Como mucho unos dos años vista." };
  let horarios: Map<string, HorarioConductor>;
  try { horarios = await horariosDe(ids, lunes, hasta); } catch (e) { return { ok: false, error: (e as Error).message }; }
  let total = 0;
  for (const id of ids) {
    const dias = planRepetirSemanas(horarios.get(id), lunes, semanas, hasta);
    const err = dias.length ? await escribirPlan(id, dias) : null;
    if (err) return { ok: false, error: err };
    total += dias.length;
  }
  refrescar();
  return { ok: true, mensaje: `Repetido el bloque de ${semanas} semana${semanas > 1 ? "s" : ""} del ${fmtDia(lunes)} hasta el ${fmtDia(hasta)}: ${total} días planificados.` };
}
