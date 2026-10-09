"use server";
import { headers } from "next/headers";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";

export type EstadoReserva = { ok?: boolean; errores?: Record<string, string[]>; mensaje?: string };

export async function reservar(_: EstadoReserva, fd: FormData): Promise<EstadoReserva> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!permitir(`reserva:${ip}`, 5, 3_600_000)) return { mensaje: "Demasiadas reservas desde esta conexión. Inténtalo más tarde." };
  const r = esquemaReserva.safeParse(Object.fromEntries(fd));
  if (!r.success) return { errores: r.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  try {
    await crearServicios(clienteAdmin(), serviciosDesdeReserva(r.data, "web"));
  } catch {
    return { mensaje: "No hemos podido registrar la reserva. Inténtalo de nuevo en unos minutos." };
  }
  return { ok: true, mensaje: "¡Reserva recibida! Te confirmaremos el traslado en breve." };
}
