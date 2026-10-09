"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { esquemaTicket, esquemaDatosTicket, fotoPathValida, fueCorregido } from "./esquema";
import type { DatosTicket } from "@/lib/lector/tipos";

export interface EstadoTicket { ok?: boolean; error?: string }

export async function guardarTicket(_: EstadoTicket, fd: FormData): Promise<EstadoTicket> {
  const yo = await exigirRol("conductor");
  const p = esquemaTicket.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Revisa los datos: fecha, litros, importe y kilómetros son obligatorios" };
  const vehiculoId = (yo as { vehiculo_habitual_id?: string | null }).vehiculo_habitual_id;
  if (!vehiculoId) return { error: "No tienes un vehículo asignado" };
  const d = p.data;
  if (d.foto_path && !fotoPathValida(d.foto_path, yo.id)) return { error: "Foto no válida" };
  let ia: DatosTicket | null = null;
  try { const j = esquemaDatosTicket.safeParse(d.datos_ia ? JSON.parse(d.datos_ia) : null); ia = j.success ? j.data : null; } catch { ia = null; }
  const corregido = ia ? fueCorregido(ia, d) : false;
  const sb = clienteAdmin();
  const { error } = await sb.from("tickets_combustible").insert({
    conductor_id: yo.id, vehiculo_id: vehiculoId, fecha: d.fecha, gasolinera: d.gasolinera, litros: d.litros,
    precio_litro: d.precio_litro ?? null, importe: d.importe, tipo_combustible: d.tipo_combustible, km: d.km,
    foto_path: d.foto_path || null, datos_ia: ia, corregido,
  });
  if (error) return { error: "No se pudo guardar el ticket" };
  await sb.from("vehiculos").update({ km_actuales: d.km }).eq("id", vehiculoId).lt("km_actuales", d.km);
  revalidatePath("/central/combustible");
  return { ok: true };
}
