"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import type { ResultadoAccion } from "@/lib/servicios/acciones";
import { ejecutarAccionOperador, marcarAlertaVista, sugerenciasServicio, type PeticionOperador } from "@/lib/central/operaciones";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import type { EstadoReserva } from "@/app/reservar/actions";

export async function accionCentral(p: PeticionOperador): Promise<ResultadoAccion> {
  const yo = await exigirRol("operador");
  const { r, avisar } = await ejecutarAccionOperador(yo.id, p);
  revalidatePath("/central", "layout");
  after(avisar);
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
  await marcarAlertaVista(servicioId);
  revalidatePath("/central", "layout");
}

export async function obtenerSugerencias(servicioId: string) {
  await exigirRol("operador");
  return (await sugerenciasServicio(servicioId)) ?? [];
}
