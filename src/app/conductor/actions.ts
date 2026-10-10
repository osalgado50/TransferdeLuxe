"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";
import { marcarFueraDeServicio, registrarLlegando } from "@/lib/servicios/llegando";

export async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar"; motivo?: string }) {
  const yo = await exigirRol("conductor");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "conductor" } });
  revalidatePath("/conductor", "layout");
  return r;
}
export async function fueraDeServicio() {
  const yo = await exigirRol("conductor");
  await marcarFueraDeServicio(clienteAdmin(), yo.id);
}
/** Aviso «Llegando» a la central (lógica compartida con la app nativa en `@/lib/servicios/llegando`). */
export async function avisarLlegando(servicioId: string, objetivo: "recogida" | "destino") {
  const yo = await exigirRol("conductor");
  return registrarLlegando(clienteAdmin(), yo.id, servicioId, objetivo);
}
