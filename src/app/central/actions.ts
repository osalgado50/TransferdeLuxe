"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase, type ResultadoAccion } from "@/lib/servicios/acciones";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import type { EstadoReserva } from "@/app/reservar/actions";

export async function accionCentral(p: { idAccion: string; servicioId: string; accion: "asignar" | "reasignar" | "cancelar" | "subcontratar"; conductorId?: string; vehiculoId?: string }): Promise<ResultadoAccion> {
  const yo = await exigirRol("operador");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "operador" } });
  revalidatePath("/central", "layout");
  return r;
}

export async function crearServicioManual(_: EstadoReserva, fd: FormData): Promise<EstadoReserva> {
  await exigirRol("operador");
  fd.set("acepta_privacidad", "on");
  const r = esquemaReserva.safeParse(Object.fromEntries(fd));
  if (!r.success) return { errores: r.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  const ids = await crearServicios(clienteAdmin(), serviciosDesdeReserva(r.data, "manual"));
  revalidatePath("/central", "layout");
  return { ok: true, mensaje: `Servicio creado (${ids.length})` };
}

export async function marcarIncidenciaVista(servicioId: string) {
  await exigirRol("operador");
  await clienteAdmin().from("servicios").update({ incidencia_vista: true }).eq("id", servicioId);
  revalidatePath("/central", "layout");
}
