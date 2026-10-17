"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccionOperador } from "@/lib/central/operaciones";

/**
 * ✕ de un conductor en Flota y ajustes. Sin historial: se borra del todo (cuenta y perfil). Con historial (servicios,
 * jornadas —que se guardan 4 años—, tickets…): se da de baja, porque borrarlo destruiría ese historial: no puede
 * entrar, desaparece de listas, asignaciones y mapa, y sus registros siguen con su nombre. Se puede reactivar.
 * Antes, sus servicios por hacer vuelven a la central para reasignarlos.
 */
export type ResultadoConductor = { ok: boolean; mensaje: string };
const uuid = z.string().uuid();
const BANEO = "876000h"; // ~100 años: la cuenta no puede volver a entrar hasta que se reactive

export async function eliminarConductor(id: string): Promise<ResultadoConductor> {
  const yo = await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, mensaje: "Conductor no válido" };
  const sb = clienteAdmin();
  try {
    const { data: p } = await sb.from("perfiles").select("id,nombre").eq("id", id).eq("rol", "conductor").maybeSingle();
    if (!p) return { ok: false, mensaje: "Ese conductor ya no existe" };
    const { count: enCurso } = await sb.from("servicios").select("id", { count: "exact", head: true }).eq("conductor_id", id).eq("es_prueba", false).in("estado", ["en_camino", "recogido"]);
    if (enCurso) return { ok: false, mensaje: `${p.nombre} tiene un servicio en curso: espera a que lo termine.` };
    // Sus servicios por hacer vuelven a la central (con aviso para reasignarlos).
    const { data: pendientes } = await sb.from("servicios").select("id,estado").eq("conductor_id", id).eq("es_prueba", false).in("estado", ["asignado", "aceptado"]);
    for (const s of pendientes ?? []) {
      await ejecutarAccionOperador(yo.id, { idAccion: crypto.randomUUID(), servicioId: s.id as string, accion: "desasignar", motivo: "Conductor dado de baja", estadoEsperado: s.estado as "asignado" | "aceptado" });
    }
    // ¿Tiene historial? Si no, se puede borrar sin perder nada.
    const cuenta = async (tabla: string, col: string) => (await sb.from(tabla).select(col, { count: "exact", head: true }).eq(col, id)).count ?? 0;
    const historial = (await Promise.all([
      cuenta("servicios", "conductor_id"), cuenta("eventos_servicio", "actor_id"), cuenta("tickets_combustible", "conductor_id"),
      cuenta("jornadas", "conductor_id"), cuenta("incidencias", "conductor_id"), cuenta("checklist_revisiones", "conductor_id"),
      cuenta("cierres_jornada", "conductor_id"), cuenta("recorridos", "conductor_id"),
    ])).reduce((a, b) => a + b, 0);
    const devueltos = pendientes?.length ? ` Sus ${pendientes.length} servicio(s) por hacer han vuelto a la central.` : "";
    if (historial === 0) {
      const { error } = await sb.auth.admin.deleteUser(id); // en cascada: perfil, posiciones, horarios…
      if (error) throw new Error(error.message);
      revalidatePath("/central", "layout");
      return { ok: true, mensaje: `${p.nombre} eliminado.${devueltos}` };
    }
    const { error } = await sb.from("perfiles").update({ rol: "baja", baja_en: new Date().toISOString(), vehiculo_habitual_id: null }).eq("id", id);
    if (error) throw new Error(error.message);
    await sb.auth.admin.updateUserById(id, { ban_duration: BANEO });
    revalidatePath("/central", "layout");
    return { ok: true, mensaje: `${p.nombre} dado de baja: ya no puede entrar ni recibir servicios. Su historial se conserva (servicios, jornadas, tickets) y puedes reactivarlo abajo.${devueltos}` };
  } catch (e) {
    console.error("[flota] eliminar conductor:", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudo eliminar el conductor. Inténtalo de nuevo." };
  }
}

export async function reactivarConductor(id: string): Promise<ResultadoConductor> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, mensaje: "Conductor no válido" };
  const sb = clienteAdmin();
  try {
    const { data, error } = await sb.from("perfiles").update({ rol: "conductor", baja_en: null }).eq("id", id).eq("rol", "baja").select("nombre");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, mensaje: "Ese conductor no está de baja" };
    await sb.auth.admin.updateUserById(id, { ban_duration: "none" });
    revalidatePath("/central", "layout");
    return { ok: true, mensaje: `${data[0].nombre} vuelve a estar activo. Asígnale un vehículo si lo necesita.` };
  } catch (e) {
    console.error("[flota] reactivar conductor:", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudo reactivar. Inténtalo de nuevo." };
  }
}
