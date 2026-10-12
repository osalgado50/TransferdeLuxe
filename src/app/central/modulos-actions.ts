"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { reordenar, type ItemChecklist } from "@/lib/dominio/checklist";

type Res = { ok: true } | { ok: false; error: string };
const uuid = z.string().uuid();
const fallo: Res = { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };

export async function resolverIncidencia(id: string, resuelta = true): Promise<Res> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos." };
  const { error } = await clienteAdmin().from("incidencias").update({ resuelta, resuelta_en: resuelta ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/central/incidencias");
  return error ? fallo : { ok: true };
}

/** «Visto» en una hoja de cierre (para toda la central): deja de ser una alerta pendiente. */
export async function cierreVisto(id: string, visto = true): Promise<Res> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos." };
  const { error } = await clienteAdmin().from("cierres_jornada").update({ visto }).eq("id", id);
  revalidatePath("/central/mantenimiento");
  return error ? fallo : { ok: true };
}

export async function revisionVista(id: string): Promise<Res> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos." };
  const { error } = await clienteAdmin().from("checklist_revisiones").update({ revisada: true }).eq("id", id);
  revalidatePath("/central/checklist");
  return error ? fallo : { ok: true };
}

const texto = z.string().trim().min(1, "Escribe el texto del ítem").max(120, "Texto demasiado largo");

export async function guardarItemChecklist(p: { id?: string; texto: string }): Promise<Res> {
  await exigirRol("operador");
  const t = texto.safeParse(p.texto);
  if (!t.success) return { ok: false, error: t.error.issues[0].message };
  const sb = clienteAdmin();
  let error;
  if (p.id) {
    if (!uuid.safeParse(p.id).success) return { ok: false, error: "Datos no válidos." };
    ({ error } = await sb.from("checklist_items").update({ texto: t.data }).eq("id", p.id));
  } else {
    const { data: ult } = await sb.from("checklist_items").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
    ({ error } = await sb.from("checklist_items").insert({ texto: t.data, orden: (ult?.orden ?? 0) + 1 }));
  }
  revalidatePath("/central/checklist");
  return error ? fallo : { ok: true };
}

/** «Quitar» desactiva el ítem (las revisiones antiguas siguen refiriéndose a él). */
export async function activarItemChecklist(id: string, activo: boolean): Promise<Res> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos." };
  const { error } = await clienteAdmin().from("checklist_items").update({ activo }).eq("id", id);
  revalidatePath("/central/checklist");
  return error ? fallo : { ok: true };
}

export async function moverItemChecklist(id: string, dir: -1 | 1): Promise<Res> {
  await exigirRol("operador");
  if (!uuid.safeParse(id).success || (dir !== -1 && dir !== 1)) return { ok: false, error: "Datos no válidos." };
  const sb = clienteAdmin();
  const { data } = await sb.from("checklist_items").select("id,texto,orden,activo");
  const nuevos = reordenar((data ?? []) as ItemChecklist[], id, dir);
  const res = await Promise.all(nuevos.map((n) => sb.from("checklist_items").update({ orden: n.orden }).eq("id", n.id)));
  revalidatePath("/central/checklist");
  return res.some((r) => r.error) ? fallo : { ok: true };
}
