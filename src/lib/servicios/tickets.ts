import type { SupabaseClient } from "@supabase/supabase-js";
import { esquemaTicket, esquemaDatosTicket, fotoPathValida, fueCorregido } from "@/app/conductor/ticket/esquema";
import type { DatosTicket } from "@/lib/lector/tipos";

export type ResultadoTicket = { ok: true } | { ok: false; error: string };

/** Valida y guarda un ticket de combustible del conductor `yo`. Compartido por la server action y la API de la app nativa. */
export async function guardarTicketConductor(
  sb: SupabaseClient, yo: { id: string; vehiculo_habitual_id?: string | null }, entrada: unknown,
): Promise<ResultadoTicket> {
  const p = esquemaTicket.safeParse(entrada);
  if (!p.success) return { ok: false, error: "Revisa los datos: fecha, litros, importe y kilómetros son obligatorios" };
  const vehiculoId = yo.vehiculo_habitual_id;
  if (!vehiculoId) return { ok: false, error: "No tienes un vehículo asignado" };
  const d = p.data;
  if (d.foto_path && !fotoPathValida(d.foto_path, yo.id)) return { ok: false, error: "Foto no válida" };
  let ia: DatosTicket | null = null;
  try { const j = esquemaDatosTicket.safeParse(d.datos_ia ? JSON.parse(d.datos_ia) : null); ia = j.success ? j.data : null; } catch { ia = null; }
  const corregido = ia ? fueCorregido(ia, d) : false;
  const { error } = await sb.from("tickets_combustible").insert({
    conductor_id: yo.id, vehiculo_id: vehiculoId, fecha: d.fecha, gasolinera: d.gasolinera, litros: d.litros,
    precio_litro: d.precio_litro ?? null, importe: d.importe, tipo_combustible: d.tipo_combustible, km: d.km,
    foto_path: d.foto_path || null, datos_ia: ia, corregido,
  });
  if (error) return { ok: false, error: "No se pudo guardar el ticket" };
  await sb.from("vehiculos").update({ km_actuales: d.km }).eq("id", vehiculoId).lt("km_actuales", d.km);
  return { ok: true };
}
