"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { esquemaReserva, madridAUtc } from "@/lib/reserva/esquema";
import { avisoCapacidad } from "@/lib/dominio/capacidad";
import { duracionServicio } from "@/lib/dominio/duracion";
import { horaMadrid, utcALocalMadrid } from "@/lib/dominio/vuelos";
import { notificarConductor } from "@/lib/push";
import { aplicarEdicion, cambiosEdicion, formularioDesde, leerFormularioOriginal, type DatosEdicion } from "@/lib/dominio/edicionServicio";
import { NOTA_DEMO } from "@/lib/demo/datosDemo";

export type EstadoEdicion = { ok?: boolean; mensaje?: string; errores?: Record<string, string[]> };

// Los mismos campos y reglas que la reserva, salvo «no en el pasado»: la central puede corregir lo que ya pasó.
const esquemaEdicion = esquemaReserva.innerType().pick({
  origen_texto: true, origen_lat: true, origen_lng: true, destino_texto: true, destino_lat: true, destino_lng: true,
  fecha: true, hora: true, pasajeros: true, maletas: true, tipo_vehiculo_pedido: true, numero_vuelo: true,
  cliente_nombre: true, cliente_apellidos: true, cliente_email: true, cliente_telefono: true, notas: true,
}).extend({ servicioId: z.string().uuid() }).superRefine((r, ctx) => {
  const fecha = new Date(`${r.fecha}T00:00:00Z`);
  if (isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== r.fecha) ctx.addIssue({ code: "custom", path: ["fecha"], message: "Fecha no válida" });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) ctx.addIssue({ code: "custom", path: ["hora"], message: "Hora no válida" });
  const av = avisoCapacidad(r.tipo_vehiculo_pedido, r.pasajeros, r.maletas);
  if (av) ctx.addIssue({ code: "custom", path: ["tipo_vehiculo_pedido"], message: av.mensaje });
});

const CAMPOS = "id,estado,conductor_id,fecha_hora_recogida,origen_texto,origen_lat,origen_lng,destino_texto,destino_lat,destino_lng," +
  "pasajeros,maletas,tipo_vehiculo_pedido,numero_vuelo,cliente_nombre,cliente_apellidos,cliente_email,cliente_telefono,notas,duracion_estimada_min,servicio_vuelta_id";

/**
 * La central cambia cualquier dato de un servicio en cualquier estado (hora, direcciones, pasajeros, cliente…). Queda en
 * el historial qué se cambió y, si afecta al trabajo del conductor asignado, se le avisa al momento.
 */
export async function editarServicio(_: EstadoEdicion, fd: FormData): Promise<EstadoEdicion> {
  const yo = await exigirRol("operador");
  const v = esquemaEdicion.safeParse(Object.fromEntries(fd));
  if (!v.success) return { errores: v.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  const r = v.data;
  try {
    const sb = clienteAdmin();
    const { data: s } = await sb.from("servicios").select(CAMPOS).eq("id", r.servicioId).maybeSingle();
    if (!s) return { mensaje: "Servicio no encontrado" };
    const antes = s as unknown as DatosEdicion & { id: string; estado: string; conductor_id: string | null; duracion_estimada_min: number; servicio_vuelta_id: string | null };
    // Solo lo que el operador ha cambiado respecto a lo que veía al abrir el formulario: un formulario abierto hace rato no
    // pisa lo que cambió después (p. ej. la recogida reajustada por el vuelo) ni mueve la hora ambigua del cambio de hora.
    const original = leerFormularioOriginal(fd.get("original")) ?? formularioDesde(antes, utcALocalMadrid(antes.fecha_hora_recogida));
    const nuevo = aplicarEdicion(antes, original, r, madridAUtc);
    // La marca de la demo va en las notas: si se cambiara, el servicio dejaría de moverse y renovarse con la demo.
    if (antes.notas === NOTA_DEMO) nuevo.notas = NOTA_DEMO;
    if (antes.servicio_vuelta_id && nuevo.fecha_hora_recogida !== antes.fecha_hora_recogida) {
      const { data: par } = await sb.from("servicios").select("fecha_hora_recogida").eq("id", antes.servicio_vuelta_id).maybeSingle();
      if (par) {
        const esIda = Date.parse(antes.fecha_hora_recogida) < Date.parse(par.fecha_hora_recogida);
        const t = Date.parse(nuevo.fecha_hora_recogida), otra = Date.parse(par.fecha_hora_recogida);
        const cuando = `${utcALocalMadrid(par.fecha_hora_recogida).slice(8, 10)}/${utcALocalMadrid(par.fecha_hora_recogida).slice(5, 7)} ${horaMadrid(par.fecha_hora_recogida)}`;
        if (esIda ? t >= otra : t <= otra) return { errores: { fecha: [esIda ? `La ida tiene que ser antes de la vuelta (${cuando})` : `La vuelta tiene que ser después de la ida (${cuando})`] }, mensaje: "Revisa la fecha" };
      }
    }
    const c = cambiosEdicion(antes, nuevo);
    if (!c.resumen.length) return { ok: true, mensaje: "No has cambiado nada" };
    const duracion = c.trayecto
      ? duracionServicio({
        origen: nuevo.origen_lat != null && nuevo.origen_lng != null ? { lat: nuevo.origen_lat, lng: nuevo.origen_lng } : null,
        destino: nuevo.destino_lat != null && nuevo.destino_lng != null ? { lat: nuevo.destino_lat, lng: nuevo.destino_lng } : null,
        origenTexto: nuevo.origen_texto, destinoTexto: nuevo.destino_texto, guardadaMin: antes.duracion_estimada_min,
      }).totalMin
      : antes.duracion_estimada_min;
    const { error } = await sb.from("servicios").update({ ...nuevo, duracion_estimada_min: duracion }).eq("id", r.servicioId);
    if (error) return { mensaje: "No se pudo guardar. Inténtalo de nuevo." };
    const motivo = c.resumen.join(" · ").slice(0, 300);
    await sb.from("eventos_servicio").insert({ servicio_id: r.servicioId, tipo: "editado", actor_id: yo.id, motivo });
    if (antes.conductor_id && c.afectaConductor && ["asignado", "aceptado", "en_camino", "recogido"].includes(antes.estado)) {
      const cuerpo = c.hora
        ? `Nueva hora de recogida: ${horaMadrid(nuevo.fecha_hora_recogida)} (antes ${horaMadrid(antes.fecha_hora_recogida)}). ${utcALocalMadrid(nuevo.fecha_hora_recogida).slice(8, 10)}/${utcALocalMadrid(nuevo.fecha_hora_recogida).slice(5, 7)}`
        : `Revisa el servicio de las ${horaMadrid(nuevo.fecha_hora_recogida)}: ${motivo}`;
      after(() => notificarConductor(r.servicioId, "Servicio modificado por la central", cuerpo.slice(0, 180), "servicio_modificado"));
    }
    revalidatePath("/central", "layout");
    revalidatePath("/conductor", "layout");
    return { ok: true, mensaje: `Guardado: ${motivo}` };
  } catch (e) {
    console.error("[central] editar servicio", e instanceof Error ? e.message : e);
    return { mensaje: "No se pudo guardar ahora (sin conexión con la base de datos). Inténtalo de nuevo." };
  }
}
