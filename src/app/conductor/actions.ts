"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";

export async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar"; motivo?: string }) {
  const yo = await exigirRol("conductor");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "conductor" } });
  revalidatePath("/conductor", "layout");
  return r;
}
export async function fueraDeServicio() {
  const yo = await exigirRol("conductor");
  await clienteAdmin().from("posicion_actual").update({ en_servicio: false }).eq("conductor_id", yo.id);
}
