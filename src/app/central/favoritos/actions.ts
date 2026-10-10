"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { esquemaFavoritoDireccion, esquemaFavoritoTrayecto, esquemaNombre } from "@/lib/dominio/favoritos";
import { z } from "zod";

export type ResultadoFavorito = { ok: true } | { ok: false; error: string };
const MSG_GENERICO = "No se pudo guardar el favorito. Inténtalo de nuevo";
const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos no válidos";

function amigable(e: { code?: string }): string {
  if (e.code === "23514" || e.code === "22P02" || e.code === "22003") return "Algún valor del favorito no es válido";
  if (e.code === "42501") return "No tienes permiso para esta operación";
  return MSG_GENERICO;
}
const DUPLICADO = "Ya existe un favorito con ese nombre";
async function nombreRepetido(tipo: string, nombre: string, exceptoId?: string): Promise<boolean> {
  const { data } = await clienteAdmin().from("favoritos").select("id").eq("tipo", tipo).ilike("nombre", nombre.replace(/[%_\\]/g, "\\$&"));
  return (data ?? []).some((f) => f.id !== exceptoId);
}
/** Si faltan coordenadas pero el texto es exactamente un lugar frecuente, se toman de ahí. */
async function completarCoordenadas<T extends { texto: string; lat: number | null; lng: number | null }>(d: T): Promise<T> {
  if (d.lat != null && d.lng != null) return d;
  const { data } = await clienteAdmin().from("lugares_frecuentes").select("lat,lng").ilike("nombre", d.texto.replace(/[%_\\]/g, "\\$&")).limit(1);
  return data?.[0] ? { ...d, lat: data[0].lat, lng: data[0].lng } : d;
}
const refrescar = () => { revalidatePath("/central/flota"); revalidatePath("/central/servicios/nuevo"); };

export async function guardarFavoritoDireccion(entrada: unknown): Promise<ResultadoFavorito> {
  const p = await exigirRol("operador");
  const r = esquemaFavoritoDireccion.safeParse(entrada);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (await nombreRepetido("direccion", r.data.nombre)) return { ok: false, error: DUPLICADO };
  const { nombre, texto, lat, lng } = await completarCoordenadas(r.data);
  const { error } = await clienteAdmin().from("favoritos").insert({
    tipo: "direccion", nombre, origen_texto: texto, origen_lat: lat, origen_lng: lng, creado_por: p.id,
  });
  if (error) return { ok: false, error: amigable(error) };
  refrescar();
  return { ok: true };
}

export async function guardarFavoritoTrayecto(entrada: unknown): Promise<ResultadoFavorito> {
  const p = await exigirRol("operador");
  const r = esquemaFavoritoTrayecto.safeParse(entrada);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (await nombreRepetido("trayecto", r.data.nombre)) return { ok: false, error: DUPLICADO };
  const o = await completarCoordenadas({ texto: r.data.origen_texto, lat: r.data.origen_lat, lng: r.data.origen_lng });
  const d = await completarCoordenadas({ texto: r.data.destino_texto, lat: r.data.destino_lat, lng: r.data.destino_lng });
  const { error } = await clienteAdmin().from("favoritos").insert({
    tipo: "trayecto", ...r.data, origen_lat: o.lat, origen_lng: o.lng, destino_lat: d.lat, destino_lng: d.lng, creado_por: p.id,
  });
  if (error) return { ok: false, error: amigable(error) };
  refrescar();
  return { ok: true };
}

export async function renombrarFavorito(id: string, nombre: string): Promise<ResultadoFavorito> {
  await exigirRol("operador");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Favorito no válido" };
  const n = esquemaNombre.safeParse(nombre);
  if (!n.success) return { ok: false, error: primerError(n.error) };
  const sb = clienteAdmin();
  const { data: actual } = await sb.from("favoritos").select("tipo").eq("id", id).maybeSingle();
  if (actual && await nombreRepetido(actual.tipo, n.data, id)) return { ok: false, error: DUPLICADO };
  const { data, error } = await sb.from("favoritos").update({ nombre: n.data }).eq("id", id).select("id");
  if (error) return { ok: false, error: amigable(error) };
  if (!data?.length) return { ok: false, error: "El favorito ya no existe" };
  refrescar();
  return { ok: true };
}

export async function borrarFavorito(id: string): Promise<ResultadoFavorito> {
  await exigirRol("operador");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Favorito no válido" };
  const { error } = await clienteAdmin().from("favoritos").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar el favorito. Inténtalo de nuevo" };
  refrescar();
  return { ok: true };
}
