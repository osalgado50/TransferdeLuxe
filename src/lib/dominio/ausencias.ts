import { diaMadrid } from "./geo";
import { sumarDias } from "./dias";

/**
 * Ausencias de los conductores (vacaciones, fiestas, días libres, bajas): lógica pura compartida por la central (alta,
 * calendario, bloqueo en la sugerencia y en la asignación automática), el servidor y las apps del conductor.
 * Fechas «YYYY-MM-DD» (día de Madrid), ambos extremos incluidos. Franja: todo el día, mañana (< 14:00) o tarde.
 */
export type TipoAusencia = "vacaciones" | "fiesta" | "libre" | "baja" | "otro";
export type FranjaAusencia = "dia" | "manana" | "tarde";
export const TIPOS_AUSENCIA: readonly TipoAusencia[] = ["vacaciones", "fiesta", "libre", "baja", "otro"];
export const FRANJAS_AUSENCIA: readonly FranjaAusencia[] = ["dia", "manana", "tarde"];
export const NOMBRE_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  vacaciones: "vacaciones", fiesta: "fiesta", libre: "día libre", baja: "baja", otro: "ausencia",
};
export const NOMBRE_FRANJA: Record<FranjaAusencia, string> = { dia: "todo el día", manana: "mañana", tarde: "tarde" };
/** Colores del calendario (fondo de la celda). */
export const COLOR_TIPO_AUSENCIA: Record<TipoAusencia, string> = {
  vacaciones: "#0ea5e9", fiesta: "#a855f7", libre: "#22c55e", baja: "#ef4444", otro: "#f59e0b",
};
/** La mañana termina a las 14:00 (hora de Madrid). */
export const HORA_TARDE = 14;

export interface Ausencia {
  id?: string; conductor_id: string; desde: string; hasta: string; franja: FranjaAusencia; tipo: TipoAusencia; nota?: string | null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" });

/** Franja (mañana/tarde) de un instante en Madrid: mañana antes de las 14:00. */
export function franjaDeHora(iso: string | Date): "manana" | "tarde" {
  return Number(fmtHora.format(typeof iso === "string" ? new Date(iso) : iso)) % 24 < HORA_TARDE ? "manana" : "tarde";
}

/** ¿La ausencia cubre ese día (y franja, si se indica)? Una ausencia de «día» cubre las dos franjas. */
export function cubre(a: Pick<Ausencia, "desde" | "hasta" | "franja">, dia: string, franja?: "manana" | "tarde"): boolean {
  if (dia < a.desde || dia > a.hasta) return false;
  return a.franja === "dia" || !franja || a.franja === franja;
}

/** Ausencia del conductor que bloquea un servicio que empieza a esa hora (día y franja de Madrid), o null. */
export function ausenciaEn<A extends Ausencia>(ausencias: readonly A[], conductorId: string, inicio: string | Date): A | null {
  const dia = diaMadrid(inicio), f = franjaDeHora(inicio);
  return ausencias.find((a) => a.conductor_id === conductorId && cubre(a, dia, f)) ?? null;
}

/** «No disponible · vacaciones» (+ « (tarde)» si es solo media jornada). */
export function motivoNoDisponible(a: Pick<Ausencia, "tipo" | "franja">): string {
  return `No disponible · ${NOMBRE_TIPO_AUSENCIA[a.tipo]}${a.franja === "dia" ? "" : ` (${NOMBRE_FRANJA[a.franja]})`}`;
}

/** Pregunta al asignar a mano a un conductor ausente. */
export function preguntaAsignarAusente(a: Pick<Ausencia, "tipo" | "franja">): string {
  const que = a.tipo === "vacaciones" ? "Está de vacaciones" : a.tipo === "baja" ? "Está de baja" : a.tipo === "fiesta" ? "Tiene fiesta"
    : a.tipo === "libre" ? "Tiene el día libre" : "No está disponible";
  return `${que} ese día${a.franja === "dia" ? "" : ` (${NOMBRE_FRANJA[a.franja]})`}. ¿Asignar igualmente?`;
}

/** Motivo que queda en el evento «asignado» cuando la central asigna igualmente a un ausente (se registra). */
export const PREFIJO_ASIGNADO_AUSENTE = "ausente";
export const motivoAsignadoAusente = (a: Pick<Ausencia, "tipo" | "franja">) => `${PREFIJO_ASIGNADO_AUSENTE}: ${motivoNoDisponible(a).replace(/^No disponible · /, "")}`;

export type ValidacionAusencia = { ok: true; datos: Omit<Ausencia, "id"> } | { ok: false; error: string };

/** Valida el alta/edición desde la central. */
export function validarAusencia(e: { conductor_id?: unknown; desde?: unknown; hasta?: unknown; franja?: unknown; tipo?: unknown; nota?: unknown }): ValidacionAusencia {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const conductor_id = s(e.conductor_id), desde = s(e.desde), hasta = s(e.hasta) || s(e.desde);
  const franja = (s(e.franja) || "dia") as FranjaAusencia, tipo = s(e.tipo) as TipoAusencia, nota = s(e.nota).slice(0, 300);
  if (!/^[0-9a-f-]{36}$/i.test(conductor_id)) return { ok: false, error: "Elige el conductor." };
  if (!TIPOS_AUSENCIA.includes(tipo)) return { ok: false, error: "Elige el tipo de ausencia." };
  if (!FRANJAS_AUSENCIA.includes(franja)) return { ok: false, error: "Franja no válida." };
  if (!DIA.test(desde) || !DIA.test(hasta) || Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) return { ok: false, error: "Indica las fechas." };
  if (hasta < desde) return { ok: false, error: "La fecha final es anterior a la inicial." };
  if ((Date.parse(hasta) - Date.parse(desde)) / 86400e3 > 366) return { ok: false, error: "Como mucho un año seguido." };
  if (franja !== "dia" && desde !== hasta) return { ok: false, error: "Media jornada (mañana/tarde) solo para un día." };
  return { ok: true, datos: { conductor_id, desde, hasta, franja, tipo, nota } };
}

/** Servicios del conductor (asignados/aceptados…) que caen dentro de la ausencia: hay que devolverlos para reasignar. */
export function serviciosAfectados<S extends { conductor_id: string | null; fecha_hora_recogida: string; estado: string }>(
  a: Pick<Ausencia, "conductor_id" | "desde" | "hasta" | "franja">, servicios: readonly S[],
): S[] {
  return servicios.filter((s) => s.conductor_id === a.conductor_id && (s.estado === "asignado" || s.estado === "aceptado")
    && cubre(a, diaMadrid(s.fecha_hora_recogida), franjaDeHora(s.fecha_hora_recogida)))
    .sort((x, y) => x.fecha_hora_recogida.localeCompare(y.fecha_hora_recogida));
}

/** Días «YYYY-MM-DD» de un mes «YYYY-MM». */
export function diasDelMes(mes: string): string[] {
  const out: string[] = [];
  for (let d = `${mes}-01`; d.startsWith(mes); d = sumarDias(d, 1)) out.push(d);
  return out;
}
export const mesDe = (dia: string) => dia.slice(0, 7);
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export interface CeldaCalendario { dia: string; ausencia: Ausencia | null; franja: FranjaAusencia | null }
/** Calendario mensual de la plantilla: una fila por conductor con la ausencia de cada día (la de día completo manda). */
export function calendarioMes(mes: string, conductores: readonly { id: string }[], ausencias: readonly Ausencia[]): Record<string, CeldaCalendario[]> {
  const dias = diasDelMes(mes);
  return Object.fromEntries(conductores.map((c) => {
    const suyas = ausencias.filter((a) => a.conductor_id === c.id);
    return [c.id, dias.map((dia) => {
      const del = suyas.filter((a) => cubre(a, dia));
      const a = del.find((x) => x.franja === "dia") ?? del[0] ?? null;
      const franja = !a ? null : a.franja === "dia" || (del.some((x) => x.franja === "manana") && del.some((x) => x.franja === "tarde")) ? "dia" : a.franja;
      return { dia, ausencia: a, franja };
    })];
  }));
}

/** Próximas ausencias de un conductor (para su pestaña Jornada): las que aún no han terminado, por fecha. */
export function proximasAusencias<A extends Ausencia>(ausencias: readonly A[], hoy: string, max = 5): A[] {
  return ausencias.filter((a) => a.hasta >= hoy).sort((x, y) => x.desde.localeCompare(y.desde)).slice(0, max);
}

const fmtCorto = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const corto = (d: string) => fmtCorto.format(new Date(`${d}T12:00:00Z`)).replace(".", "");
/** «Vacaciones · 20 oct – 24 oct», «Día libre · 21 oct (tarde)». */
export function textoAusencia(a: Pick<Ausencia, "tipo" | "desde" | "hasta" | "franja">): string {
  const t = NOMBRE_TIPO_AUSENCIA[a.tipo];
  const rango = a.desde === a.hasta ? corto(a.desde) : `${corto(a.desde)} – ${corto(a.hasta)}`;
  return `${t[0].toUpperCase()}${t.slice(1)} · ${rango}${a.franja === "dia" ? "" : ` (${NOMBRE_FRANJA[a.franja]})`}`;
}

/**
 * ¿Por qué no se puede proponer a este conductor para un servicio que empieza en `inicio`? Ausencia (vacaciones…) en ese
 * día/franja, o jornada ya cerrada si el servicio es del mismo día. null = disponible.
 */
export function bloqueoConductor(c: { id: string; ausencias?: readonly Ausencia[]; jornadaCerradaDia?: string | null }, inicio: string | Date | number):
  { motivo: string; ausencia: Ausencia | null } | null {
  const t = typeof inicio === "number" ? new Date(inicio) : inicio;
  const a = c.ausencias?.length ? ausenciaEn(c.ausencias, c.id, t) : null;
  if (a) return { motivo: motivoNoDisponible(a), ausencia: a };
  if (c.jornadaCerradaDia && c.jornadaCerradaDia === diaMadrid(t)) return { motivo: "Jornada cerrada hoy", ausencia: null };
  return null;
}
