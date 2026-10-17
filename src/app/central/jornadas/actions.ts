"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { exigirModulo, jornadaAbierta } from "@/lib/conductor/modulos";
import { errorMomentoCentral } from "@/lib/dominio/jornada";
import { madridAUtc } from "@/lib/dominio/dias";
import { horaMadrid } from "@/lib/dominio/vuelos";
import { notificarAConductor } from "@/lib/push";

export type ResultadoJornada = { ok: boolean; mensaje: string; estado?: "fuera" | "trabajando"; desde?: string | null };

const entrada = z.object({
  conductorId: z.string().uuid(),
  accion: z.enum(["iniciar", "finalizar"]),
  // Fecha y hora de Madrid tal como las pone el operador («AAAA-MM-DDTHH:mm»).
  momento: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

/**
 * La central empieza o termina la jornada de un conductor (p. ej. se olvidó de abrirla o de cerrarla), a la hora que
 * indique. Queda registrado que lo hizo la central (`inicio_por` / `fin_por`) y el conductor recibe un aviso.
 * Terminarla así no pide la hoja de cierre del vehículo.
 */
export async function jornadaPorCentral(datos: { conductorId: string; accion: "iniciar" | "finalizar"; momento: string }): Promise<ResultadoJornada> {
  const yo = await exigirRol("operador");
  const v = entrada.safeParse(datos);
  if (!v.success) return { ok: false, mensaje: "Datos no válidos" };
  const { conductorId, accion } = v.data;
  try {
    const sb = clienteAdmin();
    const m = await exigirModulo(sb, "jornada");
    if (!m.ok) return { ok: false, mensaje: m.error };
    const { data: p } = await sb.from("perfiles").select("id,nombre,rol,conduce").eq("id", conductorId).maybeSingle();
    if (!p || !(p.rol === "conductor" || p.conduce)) return { ok: false, mensaje: "Ese conductor no existe o está de baja" };
    const momento = new Date(madridAUtc(v.data.momento.slice(0, 10), v.data.momento.slice(11, 16))).toISOString();
    const abierta = await jornadaAbierta(sb, conductorId);
    const { data: ultima } = await sb.from("jornadas").select("fin").eq("conductor_id", conductorId).not("fin", "is", null)
      .order("fin", { ascending: false }).limit(1).maybeSingle();
    const error = errorMomentoCentral({ accion, momento: Date.parse(momento), ahora: Date.now(), abierta, ultimaFin: ultima?.fin ?? null });
    if (error) return { ok: false, mensaje: error };

    if (accion === "iniciar") {
      const { error: e } = await sb.from("jornadas").insert({ conductor_id: conductorId, inicio: momento, inicio_por: yo.id });
      if (e) return { ok: false, mensaje: e.code === "23505" ? `${p.nombre} ya tiene una jornada abierta` : "No se pudo guardar. Inténtalo de nuevo." };
    } else {
      // La pausa en curso se cierra a la misma hora (validado: no antes de que empezara).
      const { error: e1 } = await sb.from("pausas").update({ fin: momento }).eq("jornada_id", abierta!.id).is("fin", null);
      const { data: cerradas, error: e2 } = e1 ? { data: null, error: e1 }
        : await sb.from("jornadas").update({ fin: momento, fin_por: yo.id }).eq("id", abierta!.id).is("fin", null).select("id");
      if (e2) return { ok: false, mensaje: "No se pudo guardar. Inténtalo de nuevo." };
      if (!cerradas?.length) return { ok: false, mensaje: `${p.nombre} acaba de cerrar su jornada` };
    }
    const hora = horaMadrid(momento);
    after(() => notificarAConductor(conductorId, accion === "iniciar" ? "Jornada iniciada por la central" : "Jornada cerrada por la central",
      `Registrada a las ${hora}. Si no es correcto, avisa a la central.`, { tipo: "jornada_central" }));
    revalidatePath("/central", "layout");
    revalidatePath("/conductor", "layout");
    return { ok: true, mensaje: `${accion === "iniciar" ? "Jornada iniciada" : "Jornada cerrada"} para ${p.nombre} a las ${hora}`,
      estado: accion === "iniciar" ? "trabajando" : "fuera", desde: accion === "iniciar" ? momento : null };
  } catch (e) {
    console.error("[central] jornada:", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudo guardar ahora (sin conexión con la base de datos). Inténtalo de nuevo." };
  }
}
