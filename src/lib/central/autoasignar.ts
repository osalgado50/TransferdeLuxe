import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { ejecutarAccionOperador } from "@/lib/central/operaciones";
import { rutaEnCache } from "@/lib/navegacion/ruta";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import { ESTADOS_AGENDA } from "@/lib/dominio/planificacion";
import { duracionEfectiva, duracionServicio, textoDuracion, MARGEN_MINIMO_DEFECTO_MIN } from "@/lib/dominio/duracion";
import { conexionConductor, type Conexion } from "@/lib/dominio/conexionConductor";
import { gpsReciente } from "@/lib/dominio/puntualidadCentral";
import { lugarBreve } from "@/lib/dominio/actividad";
import {
  evaluarAsignacion, proponerAsignacion, ESTRATEGIAS, type ConductorAuto, type EntradaAuto, type Estrategia, type Propuesta, type ServicioAuto,
} from "@/lib/dominio/autoasignacion";
import type { Punto } from "@/lib/dominio/tipos";
import { cargarDisponibilidad, disponibilidadDe, type Disponibilidad } from "@/lib/central/disponibilidad";
import { NOMBRE_FRANJA, NOMBRE_TIPO_AUSENCIA } from "@/lib/dominio/ausencias";
import { MOTIVO_JORNADA_CERRADA } from "@/lib/dominio/finJornada";
import { intervalosDelDia, textoTramos, tramosDelDia, vehiculoDelTurno } from "@/lib/dominio/horarios";

/** Lógica de servidor de la asignación automática: la usan las Server Actions (web) y /api/central/autoasignar/*. */

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const estrategia = z.enum(ESTRATEGIAS.map((e) => e.clave) as [Estrategia, ...Estrategia[]]);
export const esquemaPropuesta = z.object({
  dia: z.string().regex(DIA).optional(),
  servicioIds: z.array(z.string().uuid()).max(300).optional(),
  conductorIds: z.array(z.string().uuid()).max(100).optional(),
  estrategia: estrategia.default("equitativo"),
  margenMinimo: z.number().int().min(0).max(120).optional(),
});
export const esquemaConfirmar = z.object({
  /** Identificador del lote (uuid del cliente): con él y el servicio se deriva el idAccion → reintentos idempotentes. */
  lote: z.string().uuid(),
  margenMinimo: z.number().int().min(0).max(120).optional(),
  lineas: z.array(z.object({ servicioId: z.string().uuid(), conductorId: z.string().uuid(), forzar: z.boolean().optional() })).min(1).max(300),
});
export type PeticionPropuesta = z.infer<typeof esquemaPropuesta>;
export type PeticionConfirmar = z.infer<typeof esquemaConfirmar>;

const CAMPOS = "id,estado,conductor_id,fecha_hora_recogida,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng,origen_texto,destino_texto,pasajeros,maletas";
type Fila = {
  id: string; estado: string; conductor_id: string | null; fecha_hora_recogida: string; duracion_estimada_min: number;
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
  origen_texto: string; destino_texto: string; pasajeros: number; maletas: number;
};
type Perfil = { id: string; nombre: string; vehiculo_habitual_id: string | null };
type Vehiculo = { id: string; matricula: string; plazas: number; maletas: number; estado: "activo" | "taller" };

const punto = (lat: number | null, lng: number | null): Punto | null => (lat != null && lng != null ? { lat, lng } : null);
const rangoDia = (dia: string) => ({ desde: madridAUtc(dia, "00:00"), hasta: madridAUtc(sumarDias(dia, 1), "00:00") });

function rutaMin(o: Punto | null, d: Punto | null): number | null {
  const r = o && d ? rutaEnCache(o, d) : null;
  return r ? r.duracionS / 60 : null;
}
function aServicio(f: Fila, delDia = true): ServicioAuto {
  const origen = punto(f.origen_lat, f.origen_lng), destino = punto(f.destino_lat, f.destino_lng);
  return {
    id: f.id, inicio: Date.parse(f.fecha_hora_recogida), pasajeros: f.pasajeros, maletas: f.maletas, origen, destino, delDia,
    duracionMin: duracionEfectiva({ origen, destino, origenTexto: f.origen_texto, destinoTexto: f.destino_texto, guardadaMin: f.duracion_estimada_min, rutaMin: rutaMin(origen, destino) }),
  };
}

export interface ServicioInfo {
  id: string; hora: string; origen_texto: string; destino_texto: string; trayecto: string; pasajeros: number; maletas: number;
  duracionMin: number; duracionTexto: string;
}
export interface ConductorInfo {
  id: string; nombre: string; conexion: Conexion; compromisos: number; marcado: boolean;
  vehiculo: { id: string; matricula: string; plazas: number; maletas: number; estado: "activo" | "taller" } | null;
  /** «No disponible · vacaciones», «Jornada cerrada hoy»… en ese día (no sale marcado si es todo el día). */
  noDisponible?: string | null;
  /** «Turno 08:00–13:00 · 16:00–20:00» ese día; null sin horario. */
  turno?: string | null;
}

/** Aviso del diálogo para un conductor en un día: ausencia (todo el día o media) o jornada ya cerrada hoy. */
function noDisponibleDia(d: Disponibilidad, conductorId: string, dia: string): { texto: string; todoElDia: boolean } | null {
  const a = d.ausencias.find((x) => x.conductor_id === conductorId && dia >= x.desde && dia <= x.hasta);
  if (a) return { texto: `No disponible · ${NOMBRE_TIPO_AUSENCIA[a.tipo]}${a.franja === "dia" ? "" : ` (${NOMBRE_FRANJA[a.franja]})`}`, todoElDia: a.franja === "dia" };
  if (d.cerradasHoy.has(conductorId) && dia === d.hoy) return { texto: MOTIVO_JORNADA_CERRADA, todoElDia: true };
  const ivs = intervalosDelDia(d.horarios.get(conductorId), dia); // incluye la cola del turno de noche de la víspera
  if (ivs && !ivs.length) return { texto: "Libre ese día (horario)", todoElDia: true };
  return null;
}
/** «Turno 08:00–13:00 · 16:00–20:00» para el diálogo; null sin horario. */
function turnoDia(d: Disponibilidad, conductorId: string, dia: string): string | null {
  const h = tramosDelDia(d.horarios.get(conductorId), dia);
  return h.restringido && h.tramos.length ? `Turno ${textoTramos(h.tramos)}` : null;
}
/** Vehículo del turno de ese día (relevo en la base) o, si no hay, el habitual. */
function vehiculoParaDia<V extends { id: string }>(d: Disponibilidad, c: Perfil, vehiculos: (c: Perfil) => V | null, todos: V[], dia: string): V | null {
  const turno = vehiculoDelTurno(d.horarios.get(c.id), dia);
  return (turno ? todos.find((v) => v.id === turno) : undefined) ?? vehiculos(c);
}
function info(f: Fila): ServicioInfo {
  const origen = punto(f.origen_lat, f.origen_lng), destino = punto(f.destino_lat, f.destino_lng);
  const d = duracionServicio({ origen, destino, origenTexto: f.origen_texto, destinoTexto: f.destino_texto, guardadaMin: f.duracion_estimada_min, rutaMin: rutaMin(origen, destino) });
  const total = duracionEfectiva({ origen, destino, origenTexto: f.origen_texto, destinoTexto: f.destino_texto, guardadaMin: f.duracion_estimada_min, rutaMin: rutaMin(origen, destino) });
  return {
    id: f.id, hora: f.fecha_hora_recogida, origen_texto: f.origen_texto, destino_texto: f.destino_texto,
    trayecto: `${lugarBreve(f.origen_texto)} → ${lugarBreve(f.destino_texto)}`, pasajeros: f.pasajeros, maletas: f.maletas,
    duracionMin: total, duracionTexto: textoDuracion(d, total),
  };
}

async function ajustes() {
  const { data } = await clienteAdmin().from("ajustes").select("umbral_sin_senal_min,margen_minimo_min").eq("id", 1).maybeSingle();
  return { umbral: data?.umbral_sin_senal_min ?? 5, margen: data?.margen_minimo_min ?? MARGEN_MINIMO_DEFECTO_MIN };
}

/** Conductores (quienes conducen) con vehículo, conexión y si salen marcados por defecto. */
async function cargarConductores(ahora: Date, umbral: number) {
  const sb = clienteAdmin();
  const [g, v, p] = await Promise.all([
    sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("vehiculos").select("id,matricula,plazas,maletas,estado"),
    sb.from("posicion_actual").select("conductor_id,lat,lng,en_servicio,registrado_en"),
  ]);
  const f = [g, v, p].find((x) => x.error);
  if (f?.error) throw new Error(f.error.message);
  const vehiculos = (v.data ?? []) as Vehiculo[];
  return {
    perfiles: (g.data ?? []) as Perfil[], posiciones: p.data ?? [], vehiculos,
    vehiculoDe: (c: Perfil) => vehiculos.find((x) => x.id === c.vehiculo_habitual_id) ?? null,
    conexionDe: (id: string) => conexionConductor(p.data?.find((x) => x.conductor_id === id), ahora, umbral),
  };
}

/** Compromisos fijos (asignado…recogido) de esos conductores alrededor de las horas indicadas. */
async function cargarCompromisos(conductorIds: string[], desde: number, hasta: number): Promise<Fila[]> {
  if (!conductorIds.length) return [];
  const { data, error } = await clienteAdmin().from("servicios").select(CAMPOS).eq("es_prueba", false)
    .in("conductor_id", conductorIds).in("estado", [...ESTADOS_AGENDA])
    .gte("fecha_hora_recogida", new Date(desde).toISOString()).lt("fecha_hora_recogida", new Date(hasta).toISOString()).limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Fila[];
}

/** Datos del diálogo: pendientes del día, conductores con estado y margen mínimo por defecto. */
export async function datosAutoasignar(diaPedido?: string, ahora = new Date()) {
  const dia = diaPedido && DIA.test(diaPedido) ? diaPedido : diaMadrid(ahora);
  const { umbral, margen } = await ajustes();
  const r = rangoDia(dia);
  const sb = clienteAdmin();
  const [{ data, error }, cs, disp] = await Promise.all([
    sb.from("servicios").select(CAMPOS).eq("es_prueba", false).eq("estado", "pendiente")
      .gte("fecha_hora_recogida", r.desde).lt("fecha_hora_recogida", r.hasta).order("fecha_hora_recogida").limit(300),
    cargarConductores(ahora, umbral),
    cargarDisponibilidad(sb, dia, dia, ahora),
  ]);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Fila[];
  const compromisos = await cargarCompromisos(cs.perfiles.map((c) => c.id), Date.parse(r.desde), Date.parse(r.hasta));
  const conductores: ConductorInfo[] = cs.perfiles.map((c) => {
    const v = vehiculoParaDia(disp, c, cs.vehiculoDe, cs.vehiculos, dia);
    const nd = noDisponibleDia(disp, c.id, dia);
    return {
      id: c.id, nombre: c.nombre, conexion: cs.conexionDe(c.id), vehiculo: v, marcado: !!v && v.estado === "activo" && !nd?.todoElDia,
      compromisos: compromisos.filter((x) => x.conductor_id === c.id).length, noDisponible: nd?.texto ?? null, turno: turnoDia(disp, c.id, dia),
    };
  });
  return {
    dia, margenMinimo: margen, ahora: ahora.toISOString(),
    pendientes: filas.map((f) => ({ ...info(f), marcado: Date.parse(f.fecha_hora_recogida) > ahora.getTime() })),
    conductores,
  };
}

/** Construye la entrada pura (servicios aún pendientes, conductores con compromisos y GPS) a partir de la petición. */
export async function construirEntrada(p: { dia?: string; servicioIds?: string[]; conductorIds?: string[]; estrategia: Estrategia; margenMinimo?: number },
  ahora = new Date()) {
  const { umbral, margen } = await ajustes();
  const sb = clienteAdmin();
  const dia = p.dia && DIA.test(p.dia) ? p.dia : diaMadrid(ahora);
  let q = sb.from("servicios").select(CAMPOS).eq("es_prueba", false).eq("estado", "pendiente").order("fecha_hora_recogida").limit(300);
  if (p.servicioIds?.length) q = q.in("id", p.servicioIds);
  else { const r = rangoDia(dia); q = q.gte("fecha_hora_recogida", r.desde).lt("fecha_hora_recogida", r.hasta); }
  const [{ data, error }, cs] = await Promise.all([q, cargarConductores(ahora, umbral)]);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Fila[];
  const diasFilas = filas.map((f) => diaMadrid(f.fecha_hora_recogida)).sort();
  const disp = await cargarDisponibilidad(sb, diasFilas[0] ?? dia, diasFilas.at(-1) ?? dia, ahora);
  const diaRef = diasFilas[0] ?? dia;
  const vehiculoDe = (c: Perfil) => vehiculoParaDia(disp, c, cs.vehiculoDe, cs.vehiculos, diaRef);
  const elegidos = cs.perfiles.filter((c) => (p.conductorIds?.length ? p.conductorIds.includes(c.id) : (vehiculoDe(c)?.estado === "activo")));
  // Compromisos: de 12 h antes del primer servicio a 12 h después del último (sirven para encajar).
  const tiempos = filas.map((f) => Date.parse(f.fecha_hora_recogida));
  const desde = (tiempos.length ? Math.min(...tiempos) : Date.parse(rangoDia(dia).desde)) - 12 * 3600e3;
  const hasta = (tiempos.length ? Math.max(...tiempos) : Date.parse(rangoDia(dia).hasta)) + 12 * 3600e3;
  const fijos = await cargarCompromisos(elegidos.map((c) => c.id), desde, hasta);
  const diasServicios = new Set(filas.map((f) => diaMadrid(f.fecha_hora_recogida)));
  const conductores: ConductorAuto[] = elegidos.map((c) => {
    const v = vehiculoDe(c);
    return {
      id: c.id, nombre: c.nombre,
      vehiculo: v ? { id: v.id, plazas: v.plazas, maletas: v.maletas, estado: v.estado } : null,
      compromisos: fijos.filter((x) => x.conductor_id === c.id).map((x) => aServicio(x, diasServicios.has(diaMadrid(x.fecha_hora_recogida)))),
      posicion: gpsReciente(cs.posiciones.find((x) => x.conductor_id === c.id), ahora.getTime(), umbral),
      // Vacaciones / fiesta / baja, jornada cerrada hoy y horario: no se le propone nada en esos huecos.
      ...disponibilidadDe(disp, c.id),
    };
  });
  const entrada: EntradaAuto = {
    servicios: filas.map((f) => aServicio(f)), conductores, estrategia: p.estrategia, margenMinimoMin: p.margenMinimo ?? margen, ahora: ahora.getTime(),
    base: disp.base,
  };
  const infoServicios = Object.fromEntries(filas.map((f) => [f.id, info(f)]));
  const infoConductores: Record<string, ConductorInfo> = Object.fromEntries(elegidos.map((c) => [c.id, {
    id: c.id, nombre: c.nombre, conexion: cs.conexionDe(c.id), vehiculo: vehiculoDe(c), marcado: true,
    compromisos: fijos.filter((x) => x.conductor_id === c.id).length, noDisponible: noDisponibleDia(disp, c.id, dia)?.texto ?? null,
    turno: turnoDia(disp, c.id, dia),
  }]));
  return { entrada, infoServicios, infoConductores };
}

export interface ResultadoPropuesta {
  entrada: EntradaAuto; propuesta: Propuesta;
  servicios: Record<string, ServicioInfo>; conductores: Record<string, ConductorInfo>;
}
export async function calcularPropuesta(p: PeticionPropuesta, ahora = new Date()): Promise<ResultadoPropuesta> {
  const { entrada, infoServicios, infoConductores } = await construirEntrada(p, ahora);
  return { entrada, propuesta: proponerAsignacion(entrada), servicios: infoServicios, conductores: infoConductores };
}

/** idAccion determinista (formato UUID v5) a partir del lote y el servicio: reenviar el mismo lote no duplica nada. */
export function idAccionLote(lote: string, servicioId: string): string {
  const h = createHash("sha256").update(`autoasignar:${lote}:${servicioId}`).digest("hex").slice(0, 32).split("");
  h[12] = "5";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const x = h.join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export type ResultadoLinea = { servicioId: string; conductorId: string; resultado: "asignado" | "ya_asignado" | "saltado" | "error"; motivo?: string };
export interface ResultadoConfirmar { asignados: number; saltados: number; errores: number; lineas: ResultadoLinea[] }

/**
 * Confirma la propuesta: vuelve a leer todo, revalida la factibilidad de cada línea contra la asignación completa y salta
 * las que ya no estén pendientes o no encajen (salvo `forzar`). Cada asignación va por ejecutarAccionOperador
 * (idempotente) y avisa por push al conductor.
 */
export async function confirmarPropuesta(operadorId: string, p: PeticionConfirmar, ahora = new Date()): Promise<{ r: ResultadoConfirmar; avisar: () => Promise<void> }> {
  const lineas = [...new Map(p.lineas.map((l) => [l.servicioId, l])).values()];
  const { entrada } = await construirEntrada({
    servicioIds: lineas.map((l) => l.servicioId), conductorIds: [...new Set(lineas.map((l) => l.conductorId))],
    estrategia: "equitativo", margenMinimo: p.margenMinimo,
  }, ahora);
  const asign = Object.fromEntries(lineas.map((l) => [l.servicioId, l.conductorId]));
  const ev = evaluarAsignacion(entrada, asign);
  const porServicio = new Map(ev.lineas.map((l) => [l.servicioId, l]));
  const vehiculo = new Map(entrada.conductores.map((c) => [c.id, c.vehiculo?.id]));
  const res: ResultadoLinea[] = [];
  const avisos: (() => Promise<void>)[] = [];
  const inicio = new Map(entrada.servicios.map((s) => [s.id, s.inicio]));
  lineas.sort((a, b) => (inicio.get(a.servicioId) ?? 0) - (inicio.get(b.servicioId) ?? 0));
  // Las que ya no están pendientes: si ya las tiene ese conductor (reintento del mismo lote), «ya asignado».
  const fuera = lineas.filter((l) => !porServicio.has(l.servicioId)).map((l) => l.servicioId);
  const { data: actuales } = fuera.length
    ? await clienteAdmin().from("servicios").select("id,estado,conductor_id").in("id", fuera)
    : { data: [] as { id: string; estado: string; conductor_id: string | null }[] };
  for (const l of lineas) {
    const base = { servicioId: l.servicioId, conductorId: l.conductorId };
    const e = porServicio.get(l.servicioId);
    if (!e) {
      const a = actuales?.find((x) => x.id === l.servicioId);
      if (a && a.conductor_id === l.conductorId && a.estado !== "cancelado") res.push({ ...base, resultado: "ya_asignado" });
      else res.push({ ...base, resultado: "saltado", motivo: a ? `Ya no está pendiente (${a.estado.replace("_", " ")})` : "El servicio no existe" });
      continue;
    }
    if (!entrada.conductores.some((c) => c.id === l.conductorId)) { res.push({ ...base, resultado: "saltado", motivo: "Conductor no válido" }); continue; }
    if (!e.ok && !l.forzar) { res.push({ ...base, resultado: "saltado", motivo: e.motivoSiNo ?? "Ya no encaja" }); continue; }
    try {
      const { r, avisar } = await ejecutarAccionOperador(operadorId, {
        idAccion: idAccionLote(p.lote, l.servicioId), servicioId: l.servicioId, accion: "asignar", conductorId: l.conductorId,
        vehiculoId: vehiculo.get(l.conductorId) ?? undefined,
      });
      if (r.ok) { res.push({ ...base, resultado: r.duplicada ? "ya_asignado" : "asignado" }); avisos.push(avisar); }
      else res.push({ ...base, resultado: "saltado", motivo: r.error });
    } catch (err) {
      res.push({ ...base, resultado: "error", motivo: err instanceof Error ? err.message : "Error" });
    }
  }
  // Reintentos de un lote ya confirmado: lo que ya está asignado por ese lote cuenta como «ya_asignado», no como saltado.
  return {
    r: {
      asignados: res.filter((x) => x.resultado === "asignado" || x.resultado === "ya_asignado").length,
      saltados: res.filter((x) => x.resultado === "saltado").length,
      errores: res.filter((x) => x.resultado === "error").length,
      lineas: res,
    },
    avisar: async () => { for (const a of avisos) await a().catch(() => {}); },
  };
}
