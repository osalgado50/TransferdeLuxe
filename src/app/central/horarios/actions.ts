"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { DIAS_SEMANA, NOMBRE_DIA, validarTramos, type Tramo } from "@/lib/dominio/horarios";

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
    .upsert({ conductor_id: p.conductor_id, fecha: p.fecha, tramos: v.tramos, nota }, { onConflict: "conductor_id,fecha" });
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
