"use server";
import { revalidatePath } from "next/cache";
import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";
import { marcarFueraDeServicio, registrarLlegando } from "@/lib/servicios/llegando";
import { asegurarSeguimiento, datosAviso, registrarAvisoCliente } from "@/lib/servicios/seguimiento";
import type { CanalAviso, TipoAviso } from "@/lib/dominio/avisoCliente";

export async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "deshacer" | "devolver"; motivo?: string }) {
  const yo = await exigirConductor();
  const sb = clienteAdmin();
  const r = await ejecutarAccion(repoSupabase(sb), { ...p, actor: { id: yo.id, rol: yo.rol, conduce: yo.conduce } });
  if (r.ok && p.accion === "aceptar") void asegurarSeguimiento(sb, p.servicioId).catch(() => {}); // enlace de seguimiento del cliente
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

/** Datos para redactar el aviso al cliente (enlace de seguimiento, nombre de pila, vehículo). */
export async function datosAvisoCliente(servicioId: string) {
  const yo = await exigirConductor();
  const r = await datosAviso(clienteAdmin(), { id: yo.id, rol: yo.rol, conduce: yo.conduce, central: false }, servicioId);
  return r.ok ? { ok: true as const, ruta: r.ruta, conductor: r.conductor, modelo: r.modelo, matricula: r.matricula } : { ok: false as const, error: r.error };
}
/** Tras abrir WhatsApp/SMS: anota el aviso en la actividad (idempotente por idAccion). */
export async function avisoClienteEnviado(p: { idAccion: string; servicioId: string; tipo: TipoAviso; canal: CanalAviso }) {
  const yo = await exigirConductor();
  const r = await registrarAvisoCliente(clienteAdmin(), { id: yo.id, rol: yo.rol, conduce: yo.conduce, central: false }, p);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}
