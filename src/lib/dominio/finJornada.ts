import { diaMadrid } from "./geo";
import type { Accion } from "./estados";

/**
 * Fin de jornada con servicios pendientes HOY (lógica pura: PWA, app nativa, vigilante del servidor y la central).
 * Solo cuentan los servicios del día actual (Madrid) en asignado/aceptado/en camino con la recogida posterior a ahora:
 * los de mañana son otra jornada y NO se devuelven.
 */
export const MOTIVO_FIN_JORNADA = "Fin de jornada";
export const ESTADOS_PENDIENTE_HOY = ["asignado", "aceptado", "en_camino"] as const;

export interface ServicioPendiente { id: string; estado: string; fecha_hora_recogida: string; origen_texto?: string | null; destino_texto?: string | null }

export function pendientesHoy<S extends ServicioPendiente>(servicios: readonly S[], ahora: Date): S[] {
  const hoy = diaMadrid(ahora), t = ahora.getTime();
  return servicios.filter((s) => (ESTADOS_PENDIENTE_HOY as readonly string[]).includes(s.estado)
    && Date.parse(s.fecha_hora_recogida) > t && diaMadrid(s.fecha_hora_recogida) === hoy)
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
}

/** «Asignado» (aún sin aceptar) se rechaza; aceptado / en camino se devuelve. Ambos con motivo «Fin de jornada». */
export function accionFinJornada(estado: string): Extract<Accion, "rechazar" | "devolver"> | null {
  if (estado === "asignado") return "rechazar";
  if (estado === "aceptado" || estado === "en_camino") return "devolver";
  return null;
}

const fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
export const horaCorta = (iso: string) => fmtHora.format(new Date(iso));

/** «2 servicios pendientes hoy (16:00, 18:30)». */
export function textoPendientes(horas: readonly string[]): string {
  const n = horas.length;
  return `${n} servicio${n === 1 ? "" : "s"} pendiente${n === 1 ? "" : "s"} hoy${n ? ` (${horas.join(", ")})` : ""}`;
}

/** «⚠️ Marc ha cerrado la jornada con 2 servicios pendientes hoy (16:00, 18:30)». */
export const textoJornadaConPendientes = (nombre: string, horas: readonly string[]) =>
  `⚠️ ${nombre} ha cerrado la jornada con ${textoPendientes(horas)}`;

/** Devoluciones por fin de jornada (eventos devuelto/rechazado con ese motivo) del mismo conductor y en pocos minutos. */
export const esDevolucionFinJornada = (e: { tipo: string; motivo: string | null }) =>
  (e.tipo === "devuelto" || e.tipo === "rechazado") && (e.motivo ?? "").trim() === MOTIVO_FIN_JORNADA;

/** Franja del día de las recogidas devueltas: «de esta mañana», «de esta tarde» o «de hoy» (mezcla). */
export function franjaDevueltos(recogidas: readonly string[], hora = (iso: string) => Number(horaCorta(iso).slice(0, 2))): string {
  const hs = recogidas.map(hora);
  if (hs.length && hs.every((h) => h >= 14)) return "de esta tarde";
  if (hs.length && hs.every((h) => h < 14)) return "de esta mañana";
  return "de hoy";
}

/** «🔁 Marc ha terminado la jornada y ha devuelto 2 servicios de esta tarde». */
export function textoDevueltosFinJornada(nombre: string, recogidas: readonly string[]): string {
  const n = recogidas.length;
  return `🔁 ${nombre} ha terminado la jornada y ha devuelto ${n === 1 ? "1 servicio" : `${n} servicios`} ${franjaDevueltos(recogidas)}`;
}

/** Agrupa las devoluciones por fin de jornada: mismo actor y como mucho `ventanaMs` entre la primera y la última. */
export function agruparFinJornada<E extends { id: number; tipo: string; motivo: string | null; actor_id?: string | null; creado_en: string }>(
  eventos: readonly E[], ventanaMs = 15 * 60_000,
): E[][] {
  const grupos: E[][] = [];
  const lista = eventos.filter(esDevolucionFinJornada).sort((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en) || a.id - b.id);
  for (const e of lista) {
    const g = grupos.find((x) => x[0].actor_id === e.actor_id && Date.parse(e.creado_en) - Date.parse(x[0].creado_en) <= ventanaMs);
    if (g) g.push(e); else grupos.push([e]);
  }
  return grupos;
}

/**
 * Conductores que ya han CERRADO su jornada hoy (Madrid): tienen una jornada finalizada hoy y ninguna abierta.
 * La sugerencia y la asignación automática no los proponen para hoy («Jornada cerrada hoy»); para otros días, sí.
 */
export function cerradaHoy(jornadas: readonly { conductor_id: string; fin: string | null }[], ahora: Date): Set<string> {
  const hoy = diaMadrid(ahora);
  const abiertas = new Set(jornadas.filter((j) => !j.fin).map((j) => j.conductor_id));
  return new Set(jornadas.filter((j) => j.fin && diaMadrid(j.fin) === hoy && !abiertas.has(j.conductor_id)).map((j) => j.conductor_id));
}
export const MOTIVO_JORNADA_CERRADA = "Jornada cerrada hoy";
