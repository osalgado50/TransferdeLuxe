import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Ticket con lo justo para sumas y consumo (sin foto ni datos de factura). */
export interface TicketLigero { id: string; vehiculo_id: string; conductor_id: string; fecha: string; litros: number; importe: number; km: number }
const COLUMNAS = "id,vehiculo_id,conductor_id,fecha,litros,importe,km";
const PAGINA = 1000; // tope de filas por petición de Supabase

const aLigero = (t: Record<string, unknown>): TicketLigero => ({
  id: t.id as string, vehiculo_id: t.vehiculo_id as string, conductor_id: t.conductor_id as string, fecha: t.fecha as string,
  litros: Number(t.litros), importe: Number(t.importe), km: Number(t.km),
});

/** Primer y último día («YYYY-MM-DD») de un mes «YYYY-MM». */
export function limitesMes(mes: string): { inicio: string; fin: string } {
  const [y, m] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fin: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/**
 * Tickets válidos (no anulados) filtrados en SQL, leídos por páginas de 1000 (sin el tope silencioso de Supabase).
 * Orden estable por fecha e id para que la paginación no repita ni salte filas.
 */
export async function ticketsLigeros(sb: SupabaseClient, f: { desde?: string; hasta?: string; vehiculo?: string; conductor?: string; vehiculos?: string[] }):
  Promise<{ data: TicketLigero[]; error: { message: string } | null }> {
  if (f.vehiculos && f.vehiculos.length === 0) return { data: [], error: null };
  const out: TicketLigero[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let q = sb.from("tickets_combustible").select(COLUMNAS).eq("anulado", false);
    if (f.desde) q = q.gte("fecha", f.desde);
    if (f.hasta) q = q.lte("fecha", f.hasta);
    if (f.vehiculo) q = q.eq("vehiculo_id", f.vehiculo);
    if (f.conductor) q = q.eq("conductor_id", f.conductor);
    if (f.vehiculos) q = q.in("vehiculo_id", f.vehiculos);
    const { data, error } = await q.order("fecha").order("id").range(desde, desde + PAGINA - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []).map(aLigero));
    if ((data ?? []).length < PAGINA) return { data: out, error: null };
  }
}

/** Ticket de partida del consumo de un mes, por vehículo: el último válido por fecha (y km) anterior al mes. */
export async function previosAlMes(sb: SupabaseClient, vehiculos: string[], mes: string): Promise<TicketLigero[]> {
  const r = await Promise.all(vehiculos.map((v) => sb.from("tickets_combustible").select(COLUMNAS).eq("vehiculo_id", v).eq("anulado", false)
    .lt("fecha", `${mes}-01`).order("fecha", { ascending: false }).order("km", { ascending: false }).limit(1)));
  return r.flatMap((x) => (x.data ?? []).map(aLigero));
}

/**
 * Tickets para el consumo de unos vehículos (de todos los conductores): con mes, los del mes más el anterior de cada
 * vehículo; sin mes, todo su histórico. Agrupados por vehículo.
 */
export async function ticketsParaConsumoDe(sb: SupabaseClient, vehiculos: string[], mes?: string): Promise<Map<string, TicketLigero[]>> {
  const porVeh = new Map<string, TicketLigero[]>();
  if (vehiculos.length === 0) return porVeh;
  const rango = mes ? limitesMes(mes) : null;
  const [{ data }, previos] = await Promise.all([
    ticketsLigeros(sb, { vehiculos, desde: rango?.inicio, hasta: rango?.fin }),
    mes ? previosAlMes(sb, vehiculos, mes) : Promise.resolve([] as TicketLigero[]),
  ]);
  for (const t of [...previos, ...data]) porVeh.set(t.vehiculo_id, [...(porVeh.get(t.vehiculo_id) ?? []), t]);
  return porVeh;
}
