"use server";
import { headers } from "next/headers";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ipCliente } from "@/lib/ip";
import { permitir } from "@/lib/limite";
import { hayConductorLibre } from "@/lib/central/operaciones";
import { ANTELACION_MIN, sinAntelacion } from "@/lib/reserva/disponibilidad";

export type EstadoReserva = {
  ok?: boolean; errores?: Record<string, string[]>; mensaje?: string;
  /** Ningún conductor libre a esa hora: la web ofrece contactar con la central o enviarla igualmente. */
  sinHueco?: boolean; contacto?: { telefono: string | null; whatsapp: string | null };
};

const PRONTO = `Reserva con al menos ${ANTELACION_MIN} minutos de antelación (para algo más urgente, llámanos)`;

export async function reservar(_: EstadoReserva, fd: FormData): Promise<EstadoReserva> {
  const ip = ipCliente(await headers());
  const r = esquemaReserva.safeParse(Object.fromEntries(fd));
  if (!r.success) return { errores: r.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  // La web pública no admite nada pasado ni con menos de media hora (la central sí puede registrar lo que entra por teléfono).
  const ahora = Date.now();
  const errores: Record<string, string[]> = {};
  if (sinAntelacion(r.data.fecha, r.data.hora, ahora)) errores.hora = [PRONTO];
  if (r.data.con_vuelta && r.data.vuelta_fecha && r.data.vuelta_hora && sinAntelacion(r.data.vuelta_fecha, r.data.vuelta_hora, ahora)) errores.vuelta_hora = [PRONTO];
  if (Object.keys(errores).length) return { errores, mensaje: "Revisa los campos marcados" };
  const nuevos = serviciosDesdeReserva(r.data, "web");
  if (!permitir(`reserva-consulta:${ip}`, 30, 3_600_000)) return { mensaje: "Demasiadas reservas desde esta conexión. Inténtalo más tarde." };
  // Antes de registrarla: ¿hay algún conductor libre? Si no, se le dice ya al cliente (puede contactar o enviarla igualmente).
  if (fd.get("forzar") !== "1" && !(await hayConductorLibre(nuevos))) {
    const { data: aj } = await clienteAdmin().from("ajustes").select("telefono_central,whatsapp_central").eq("id", 1).maybeSingle();
    return { sinHueco: true, contacto: { telefono: aj?.telefono_central ?? null, whatsapp: aj?.whatsapp_central ?? null },
      mensaje: "A esa hora tenemos todos los coches ocupados." };
  }
  if (!permitir(`reserva:${ip}`, 5, 3_600_000)) return { mensaje: "Demasiadas reservas desde esta conexión. Inténtalo más tarde." };
  try {
    await crearServicios(clienteAdmin(), nuevos);
  } catch {
    return { mensaje: "No hemos podido registrar la reserva. Inténtalo de nuevo en unos minutos." };
  }
  return { ok: true, mensaje: "¡Reserva recibida! Te confirmaremos el traslado en breve." };
}
