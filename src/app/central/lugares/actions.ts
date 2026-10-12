"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { esquemaLugarEmpresa } from "@/lib/dominio/lugaresEmpresa";

export type ResultadoLugar = { ok: true } | { ok: false; error: string };
const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos no válidos";
const refrescar = () => { revalidatePath("/central/lugares"); revalidatePath("/central/servicios/nuevo"); };

async function nombreRepetido(nombre: string, exceptoId?: string) {
  const { data } = await clienteAdmin().from("lugares_empresa").select("id").ilike("nombre", nombre.replace(/[%_\\]/g, "\\$&"));
  return (data ?? []).some((l) => l.id !== exceptoId);
}

/** Crea (sin id) o actualiza (con id) un lugar de la empresa. */
export async function guardarLugarEmpresa(id: string | null, entrada: unknown): Promise<ResultadoLugar> {
  const p = await exigirRol("operador");
  if (id != null && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Lugar no válido" };
  const r = esquemaLugarEmpresa.safeParse(entrada);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (await nombreRepetido(r.data.nombre, id ?? undefined)) return { ok: false, error: "Ya existe un lugar con ese nombre" };
  const sb = clienteAdmin();
  const { data, error } = id
    ? await sb.from("lugares_empresa").update(r.data).eq("id", id).select("id")
    : await sb.from("lugares_empresa").insert({ ...r.data, creado_por: p.id }).select("id");
  if (error) return { ok: false, error: "No se pudo guardar el lugar. Inténtalo de nuevo" };
  if (!data?.length) return { ok: false, error: "El lugar ya no existe" };
  refrescar();
  return { ok: true };
}

export async function borrarLugarEmpresa(id: string): Promise<ResultadoLugar> {
  await exigirRol("operador");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Lugar no válido" };
  const { error } = await clienteAdmin().from("lugares_empresa").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar el lugar. Inténtalo de nuevo" };
  refrescar();
  return { ok: true };
}
