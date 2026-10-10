"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";

export async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar"; motivo?: string }) {
  const yo = await exigirRol("conductor");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "conductor" } });
  revalidatePath("/conductor", "layout");
  return r;
}
export async function fueraDeServicio() {
  const yo = await exigirRol("conductor");
  await clienteAdmin().from("posicion_actual").update({ en_servicio: false }).eq("conductor_id", yo.id);
}
/** Aviso «Llegando» a la central: solo para un servicio propio y en la fase que toca; una vez por objetivo. */
export async function avisarLlegando(servicioId: string, objetivo: "recogida" | "destino") {
  const yo = await exigirRol("conductor");
  if (objetivo !== "recogida" && objetivo !== "destino") return { ok: false };
  const sb = clienteAdmin();
  const { data: s } = await sb.from("servicios").select("id,estado,conductor_id").eq("id", servicioId).maybeSingle();
  if (!s || s.conductor_id !== yo.id) return { ok: false };
  const valido = objetivo === "recogida" ? s.estado === "aceptado" || s.estado === "en_camino" : s.estado === "recogido";
  if (!valido) return { ok: false };
  const tipo = objetivo === "recogida" ? "llegando_recogida" : "llegando_destino";
  const { count } = await sb.from("eventos_servicio").select("id", { count: "exact", head: true }).eq("servicio_id", servicioId).eq("tipo", tipo);
  if ((count ?? 0) > 0) return { ok: true };
  const { error } = await sb.from("eventos_servicio").insert({ servicio_id: servicioId, tipo, actor_id: yo.id });
  return { ok: !error };
}
