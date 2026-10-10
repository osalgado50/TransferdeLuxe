import type { SupabaseClient } from "@supabase/supabase-js";

/** Aviso «Llegando» a la central: solo para un servicio propio y en la fase que toca; una vez por objetivo. */
export async function registrarLlegando(sb: SupabaseClient, conductorId: string, servicioId: string, objetivo: "recogida" | "destino"): Promise<{ ok: boolean }> {
  if (objetivo !== "recogida" && objetivo !== "destino") return { ok: false };
  const { data: s } = await sb.from("servicios").select("id,estado,conductor_id").eq("id", servicioId).maybeSingle();
  if (!s || s.conductor_id !== conductorId) return { ok: false };
  const valido = objetivo === "recogida" ? s.estado === "aceptado" || s.estado === "en_camino" : s.estado === "recogido";
  if (!valido) return { ok: false };
  const tipo = objetivo === "recogida" ? "llegando_recogida" : "llegando_destino";
  const { count } = await sb.from("eventos_servicio").select("id", { count: "exact", head: true }).eq("servicio_id", servicioId).eq("tipo", tipo);
  if ((count ?? 0) > 0) return { ok: true };
  const { error } = await sb.from("eventos_servicio").insert({ servicio_id: servicioId, tipo, actor_id: conductorId });
  return { ok: !error };
}

export async function marcarFueraDeServicio(sb: SupabaseClient, conductorId: string) {
  await sb.from("posicion_actual").update({ en_servicio: false }).eq("conductor_id", conductorId);
}
