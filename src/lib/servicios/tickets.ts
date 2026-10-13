import type { SupabaseClient } from "@supabase/supabase-js";
import { esquemaTicket, esquemaDatosTicket, fotoPathValida, fueCorregido } from "@/app/conductor/ticket/esquema";
import type { DatosTicket } from "@/lib/lector/tipos";

export type ResultadoTicket = { ok: true } | { ok: false; error: string };
/** «1.000 km» (es-ES no agrupa los números de 4 cifras por defecto). */
const fmtKm = (n: number) => new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(n);

/**
 * Kilómetros mínimos de un ticket: el cuentakilómetros no baja. Un ticket de estos días no puede tener menos km que los
 * últimos registrados del vehículo (tickets, hoja de cierre, flota); uno atrasado (más de 2 días), no menos que el ticket
 * más alto de ese día o anterior.
 */
export async function kmMinimo(sb: SupabaseClient, vehiculoId: string, fecha: string): Promise<{ km: number; texto: string } | null> {
  const hace2 = new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10);
  if (fecha >= hace2) {
    const { data: v } = await sb.from("vehiculos").select("matricula,km_actuales").eq("id", vehiculoId).maybeSingle();
    return v ? { km: Number(v.km_actuales) || 0, texto: `los últimos registrados de ${v.matricula}` } : null;
  }
  const { data } = await sb.from("tickets_combustible").select("km,fecha").eq("vehiculo_id", vehiculoId).lte("fecha", fecha).order("km", { ascending: false }).limit(1);
  const t = (data ?? [])[0] as { km: number; fecha: string } | undefined;
  return t ? { km: t.km, texto: `los del ticket del ${t.fecha.split("-").reverse().join("/")}` } : null;
}

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
  const minimo = await kmMinimo(sb, vehiculoId, d.fecha);
  if (minimo && d.km < minimo.km) {
    return { ok: false, error: `Los kilómetros (${fmtKm(d.km)}) no pueden ser menos que ${minimo.texto}: ${fmtKm(minimo.km)} km. Revisa el cuentakilómetros.` };
  }
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
