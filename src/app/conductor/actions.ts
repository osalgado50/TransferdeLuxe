"use server";
import { revalidatePath } from "next/cache";
import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";
import { marcarFueraDeServicio, registrarLlegando } from "@/lib/servicios/llegando";

export async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "deshacer"; motivo?: string }) {
  const yo = await exigirConductor();
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: yo.rol, conduce: yo.conduce } });
  revalidatePath("/conductor", "layout");
  return r;
}
export async function fueraDeServicio() {
  const yo = await exigirConductor();
  await marcarFueraDeServicio(clienteAdmin(), yo.id);
}
/** Aviso «Llegando» a la central (lógica compartida con la app nativa en `@/lib/servicios/llegando`). */
export async function avisarLlegando(servicioId: string, objetivo: "recogida" | "destino") {
  const yo = await exigirConductor();
  return registrarLlegando(clienteAdmin(), yo.id, servicioId, objetivo);
}
