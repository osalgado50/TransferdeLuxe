"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { exigirRol } from "@/lib/supabase/sesion";
import { calcularPropuesta, confirmarPropuesta, datosAutoasignar, esquemaConfirmar, esquemaPropuesta } from "@/lib/central/autoasignar";

/** Diálogo «Asignar automáticamente» de la central web (misma lógica que /api/central/autoasignar/*). */
export async function prepararAutoasignacion(dia?: string) {
  await exigirRol("operador");
  return datosAutoasignar(dia);
}

export async function proponerAutoasignacion(p: unknown) {
  await exigirRol("operador");
  const b = esquemaPropuesta.safeParse(p);
  if (!b.success) throw new Error("Datos no válidos");
  return calcularPropuesta(b.data);
}

export async function confirmarAutoasignacion(p: unknown) {
  const yo = await exigirRol("operador");
  const b = esquemaConfirmar.safeParse(p);
  if (!b.success) throw new Error("Datos no válidos");
  const { r, avisar } = await confirmarPropuesta(yo.id, b.data);
  revalidatePath("/central", "layout");
  after(avisar);
  return r;
}
