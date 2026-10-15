"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { after } from "next/server";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import type { ResultadoAccion } from "@/lib/servicios/acciones";
import { ejecutarAccionOperador, marcarAlertaVista, sugerenciasServicio, type PeticionOperador } from "@/lib/central/operaciones";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import type { EstadoReserva } from "@/app/reservar/actions";

const uuid = z.string().uuid();
const esquemaOperador = z.object({
  idAccion: uuid, servicioId: uuid,
  accion: z.enum(["asignar", "reasignar", "cancelar", "subcontratar", "deshacer", "desasignar"]),
  conductorId: uuid.optional(), vehiculoId: uuid.optional(), motivo: z.string().max(300).optional(),
  estadoEsperado: z.enum(["pendiente", "asignado", "aceptado", "en_camino", "recogido", "completado", "cancelado", "subcontratado"]).optional(),
});

/**
 * Acción de la central sobre un servicio. Valida la petición y nunca lanza: si Supabase falla, devuelve un error legible
 * (antes la excepción tumbaba la pantalla entera con «Application error»).
 */
export async function accionCentral(p: PeticionOperador): Promise<ResultadoAccion> {
  const yo = await exigirRol("operador");
  const v = esquemaOperador.safeParse(p);
  if (!v.success) return { ok: false, error: "Petición no válida" };
  try {
    const { r, avisar } = await ejecutarAccionOperador(yo.id, v.data);
    revalidatePath("/central", "layout");
    after(avisar);
    return r;
  } catch (e) {
    console.error("[central] acción", p.accion, e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo completar ahora (sin conexión con la base de datos). Inténtalo de nuevo." };
  }
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
