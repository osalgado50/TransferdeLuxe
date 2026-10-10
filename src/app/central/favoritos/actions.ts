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
const refrescar = () => { revalidatePath("/central/flota"); revalidatePath("/central/servicios/nuevo"); };

export async function guardarFavoritoDireccion(entrada: unknown): Promise<ResultadoFavorito> {
  const p = await exigirRol("operador");
  const r = esquemaFavoritoDireccion.safeParse(entrada);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  const { nombre, texto, lat, lng } = r.data;
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
  const { error } = await clienteAdmin().from("favoritos").insert({ tipo: "trayecto", ...r.data, creado_por: p.id });
  if (error) return { ok: false, error: amigable(error) };
  refrescar();
  return { ok: true };
}

export async function renombrarFavorito(id: string, nombre: string): Promise<ResultadoFavorito> {
  await exigirRol("operador");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Favorito no válido" };
  const n = esquemaNombre.safeParse(nombre);
  if (!n.success) return { ok: false, error: primerError(n.error) };
  const { data, error } = await clienteAdmin().from("favoritos").update({ nombre: n.data }).eq("id", id).select("id");
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
