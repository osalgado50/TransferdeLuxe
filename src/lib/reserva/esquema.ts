import { z } from "zod";
import { duracionServicio, DURACION_POR_DEFECTO_MIN } from "@/lib/dominio/duracion";
import { avisoCapacidad, vehiculosAptos, motivoSubcontratar, type VehiculoCapacidad } from "@/lib/dominio/capacidad";
import type { Servicio } from "@/lib/dominio/tipos";
import { leerModulos } from "@/lib/dominio/modulos";
import { normalizarVuelo, vueloVacio, MENSAJE_VUELO } from "@/lib/dominio/vuelos";

const coord = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().nullable());
const opcional = z.preprocess((v) => (v === "" || v == null ? null : String(v).trim()), z.string().nullable());
const vuelo = z.preprocess((v) => (vueloVacio(v as string) ? null : normalizarVuelo(String(v)) ?? String(v)),
  z.string().nullable().refine((v) => v == null || normalizarVuelo(v) === v, MENSAJE_VUELO));
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha obligatoria");
const hora = z.string().regex(/^\d{2}:\d{2}$/, "Hora obligatoria");

export const esquemaReserva = z.object({
  // Topes de longitud en el servidor (el formulario público también se puede enviar a mano).
  origen_texto: z.string().trim().min(3).max(300), origen_lat: coord, origen_lng: coord,
  destino_texto: z.string().trim().min(3).max(300), destino_lat: coord, destino_lng: coord,
  fecha, hora,
  pasajeros: z.coerce.number().int().min(1).max(19),
  maletas: z.coerce.number().int().min(0).max(19),
  tipo_vehiculo_pedido: z.enum(["sedan", "minivan", "minivan_premium", "microbus", "minibus"]),
  numero_vuelo: vuelo,
  cliente_nombre: z.string().trim().min(1).max(120), cliente_apellidos: z.string().trim().max(120).default(""),
  cliente_email: z.string().trim().email().max(200), cliente_telefono: z.string().trim().min(6).max(30),
  notas: opcional.refine((v) => v == null || v.length <= 500, "Máximo 500 caracteres"),
  acepta_privacidad: z.literal("on", { errorMap: () => ({ message: "Debes aceptar la política de privacidad" }) }),
  web: z.string().max(0).optional(), // campo trampa: invisible, debe venir vacío
  con_vuelta: z.literal("on").optional(),
  vuelta_origen_texto: opcional, vuelta_origen_lat: coord.optional(), vuelta_origen_lng: coord.optional(),
  vuelta_destino_texto: opcional, vuelta_destino_lat: coord.optional(), vuelta_destino_lng: coord.optional(),
  vuelta_fecha: opcional, vuelta_hora: opcional, vuelta_numero_vuelo: vuelo.optional(),
}).superRefine((r, ctx) => {
  const valida = (f: string | null | undefined, h: string | null | undefined) => {
    const d = f ? new Date(`${f}T00:00:00Z`) : null;
    return !!d && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f && !!h && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  };
  if (!valida(r.fecha, "00:00")) ctx.addIssue({ code: "custom", path: ["fecha"], message: "Fecha no válida" });
  if (!valida("2000-01-01", r.hora)) ctx.addIssue({ code: "custom", path: ["hora"], message: "Hora no válida" });
  // Nada en el pasado (margen de 1 h para que la central registre un servicio que acaba de entrar por teléfono).
  const ida = valida(r.fecha, r.hora) ? Date.parse(madridAUtc(r.fecha, r.hora)) : null;
  if (ida != null && ida < Date.now() - MARGEN_PASADO_MS) ctx.addIssue({ code: "custom", path: ["fecha"], message: "La recogida no puede ser en el pasado" });
  const av = avisoCapacidad(r.tipo_vehiculo_pedido, r.pasajeros, r.maletas);
  if (av) ctx.addIssue({ code: "custom", path: ["tipo_vehiculo_pedido"], message: av.mensaje });
  if (!r.con_vuelta) return;
  if (r.vuelta_fecha && !valida(r.vuelta_fecha, "00:00")) ctx.addIssue({ code: "custom", path: ["vuelta_fecha"], message: "Fecha no válida" });
  if (r.vuelta_hora && !valida("2000-01-01", r.vuelta_hora)) ctx.addIssue({ code: "custom", path: ["vuelta_hora"], message: "Hora no válida" });
  for (const k of ["vuelta_origen_texto", "vuelta_destino_texto", "vuelta_fecha", "vuelta_hora"] as const)
    if (!r[k]) ctx.addIssue({ code: "custom", path: [k], message: "Obligatorio si hay vuelta" });
  if (ida != null && valida(r.vuelta_fecha, r.vuelta_hora) && Date.parse(madridAUtc(r.vuelta_fecha!, r.vuelta_hora!)) <= ida)
    ctx.addIssue({ code: "custom", path: ["vuelta_fecha"], message: "La vuelta tiene que ser después de la ida" });
});
const MARGEN_PASADO_MS = 60 * 60_000;
export type Reserva = z.infer<typeof esquemaReserva>;
export type NuevoServicio = Omit<Servicio, "id" | "estado" | "creado_en" | "servicio_vuelta_id" | "conductor_id" | "vehiculo_id" |
  "asignado_en" | "ultima_incidencia" | "incidencia_vista" | "plazo_respuesta_min">;

// Convierte fecha+hora locales de Madrid a ISO UTC.
export { madridAUtc } from "@/lib/dominio/dias";
import { madridAUtc } from "@/lib/dominio/dias";

function tramo(r: Reserva, origen: "web" | "manual", t: {
  o: string; olat: number | null; olng: number | null; d: string; dlat: number | null; dlng: number | null; fecha: string; hora: string; vuelo: string | null;
}): NuevoServicio {
  // Trayecto + carga/descarga según el tipo de punto (aeropuerto/estación 15 min, resto 5).
  const dur = duracionServicio({
    origen: t.olat != null && t.olng != null ? { lat: t.olat, lng: t.olng } : null,
    destino: t.dlat != null && t.dlng != null ? { lat: t.dlat, lng: t.dlng } : null,
    origenTexto: t.o, destinoTexto: t.d, guardadaMin: DURACION_POR_DEFECTO_MIN,
  }).totalMin;
  return {
    cliente_nombre: r.cliente_nombre, cliente_apellidos: r.cliente_apellidos, cliente_email: r.cliente_email, cliente_telefono: r.cliente_telefono,
    origen_texto: t.o, origen_lat: t.olat, origen_lng: t.olng, destino_texto: t.d, destino_lat: t.dlat, destino_lng: t.dlng,
    fecha_hora_recogida: madridAUtc(t.fecha, t.hora), pasajeros: r.pasajeros, maletas: r.maletas,
    tipo_vehiculo_pedido: r.tipo_vehiculo_pedido, numero_vuelo: t.vuelo, notas: r.notas, origen_pedido: origen,
    duracion_estimada_min: dur, subcontratar: false,
  };
}

export function serviciosDesdeReserva(r: Reserva, origen: "web" | "manual"): NuevoServicio[] {
  const ida = tramo(r, origen, { o: r.origen_texto, olat: r.origen_lat, olng: r.origen_lng, d: r.destino_texto, dlat: r.destino_lat, dlng: r.destino_lng, fecha: r.fecha, hora: r.hora, vuelo: r.numero_vuelo });
  if (!r.con_vuelta) return [ida];
  const vuelta = tramo(r, origen, { o: r.vuelta_origen_texto!, olat: r.vuelta_origen_lat ?? null, olng: r.vuelta_origen_lng ?? null,
    d: r.vuelta_destino_texto!, dlat: r.vuelta_destino_lat ?? null, dlng: r.vuelta_destino_lng ?? null, fecha: r.vuelta_fecha!, hora: r.vuelta_hora!, vuelo: r.vuelta_numero_vuelo ?? null });
  return [ida, vuelta];
}

export async function crearServicios(sb: import("@supabase/supabase-js").SupabaseClient, nuevos: NuevoServicio[]): Promise<string[]> {
  const { data: aj, error: eAj } = await sb.from("ajustes").select("plazo_respuesta_min, modulos").single();
  if (eAj) throw new Error(eAj.message);
  const { data: flota, error: eFlota } = await sb.from("vehiculos").select("plazas, maletas, estado");
  if (eFlota) throw new Error(eFlota.message);
  const propios = (flota ?? []) as VehiculoCapacidad[];
  const conVuelos = leerModulos((aj as { modulos?: unknown } | null)?.modulos).vuelos;
  const filas = nuevos.map((n) => {
    if (!conVuelos) n = { ...n, numero_vuelo: null };
    const sinFlota = vehiculosAptos(propios, n.pasajeros, n.maletas).length === 0;
    return {
      ...n, plazo_respuesta_min: aj?.plazo_respuesta_min ?? 15, incidencia_vista: false,
      subcontratar: sinFlota,
      ultima_incidencia: sinFlota ? motivoSubcontratar(n.pasajeros, n.maletas) : "nuevo",
    };
  });
  const { data, error } = await sb.from("servicios").insert(filas)
    .select("id");
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear");
  // PostgREST devuelve las filas insertadas en el mismo orden que el array enviado.
  const ids = data.map((d) => d.id as string);
  try {
    if (ids.length === 2) {
      const a = await sb.from("servicios").update({ servicio_vuelta_id: ids[1] }).eq("id", ids[0]);
      if (a.error) throw new Error(a.error.message);
      const b = await sb.from("servicios").update({ servicio_vuelta_id: ids[0] }).eq("id", ids[1]);
      if (b.error) throw new Error(b.error.message);
    }
    const ev = await sb.from("eventos_servicio").insert(ids.map((id) => ({ servicio_id: id, tipo: "creado" })));
    if (ev.error) throw new Error(ev.error.message);
  } catch (e) {
    try { await sb.from("servicios").delete().in("id", ids); } catch { /* mejor esfuerzo */ }
    throw e;
  }
  return ids;
}
