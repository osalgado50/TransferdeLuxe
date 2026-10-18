"use server";
import { headers } from "next/headers";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ipCliente } from "@/lib/ip";
import { permitir } from "@/lib/limite";
import { hayConductorLibre } from "@/lib/central/operaciones";
import { ANTELACION_MIN, sinAntelacion } from "@/lib/reserva/disponibilidad";
import { DESPLAZAMIENTOS_ALTERNATIVA } from "@/lib/demo/empresaDemo";
import { utcALocalMadrid } from "@/lib/dominio/vuelos";

export type EstadoReserva = {
  ok?: boolean; errores?: Record<string, string[]>; mensaje?: string;
  /** Ningún conductor libre a esa hora: la web ofrece contactar con la central o enviarla igualmente. */
  sinHueco?: boolean; contacto?: { telefono: string | null; whatsapp: string | null };
  /** Horas cercanas con coche libre (la ida y, si hay, la vuelta movidas lo mismo), de la más próxima a la más lejana. */
  alternativas?: HoraLibre[];
};
export interface HoraLibre { fecha: string; hora: string; vuelta?: { fecha: string; hora: string } }

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
      alternativas: await horasLibres(nuevos, ahora), mensaje: "A esa hora tenemos todos los coches ocupados." };
  }
  if (!permitir(`reserva:${ip}`, 5, 3_600_000)) return { mensaje: "Demasiadas reservas desde esta conexión. Inténtalo más tarde." };
  try {
    await crearServicios(clienteAdmin(), nuevos);
  } catch {
    return { mensaje: "No hemos podido registrar la reserva. Inténtalo de nuevo en unos minutos." };
  }
  return { ok: true, mensaje: "¡Reserva recibida! Te confirmaremos el traslado en breve." };
}

/**
 * Sin coche libre a la hora pedida: hasta 3 horas cercanas en las que sí (30 min y 1 h después, 30 min antes…), siempre con
 * la antelación mínima. La vuelta, si la hay, se mueve lo mismo.
 */
async function horasLibres(nuevos: ReturnType<typeof serviciosDesdeReserva>, ahora: number): Promise<HoraLibre[]> {
  const out: (HoraLibre & { t: number })[] = [];
  const local = (ms: number) => { const l = utcALocalMadrid(new Date(ms)); return { fecha: l.slice(0, 10), hora: l.slice(11, 16) }; };
  for (const d of DESPLAZAMIENTOS_ALTERNATIVA) {
    const mover = (iso: string) => Date.parse(iso) + d * 60_000;
    const t = mover(nuevos[0].fecha_hora_recogida);
    if (t < ahora + ANTELACION_MIN * 60_000) continue;
    const movidos = nuevos.map((s) => ({ ...s, fecha_hora_recogida: new Date(mover(s.fecha_hora_recogida)).toISOString() }));
    if (!(await hayConductorLibre(movidos))) continue;
    out.push({ t, ...local(t), ...(nuevos[1] ? { vuelta: local(mover(nuevos[1].fecha_hora_recogida)) } : {}) });
    if (out.length === 3) break;
  }
  return out.sort((a, b) => a.t - b.t).map((h) => ({ fecha: h.fecha, hora: h.hora, ...(h.vuelta ? { vuelta: h.vuelta } : {}) }));
}
