import { formatoDistancia, type TipoObjetivo } from "./navegacion";
import type { EstadoServicio } from "./tipos";

/**
 * «Deshacer» el último paso del conductor (lógica pura, compartida por el servidor, la PWA y la app nativa).
 * El conductor puede deshacer SOLO su último paso (salida, carga o descarga) durante 10 minutos y siempre que
 * nadie haya actuado después; la central puede deshacer el último paso sin límite de tiempo.
 */
export const VENTANA_DESHACER_MS = 10 * 60_000;
/** Por encima de esta distancia al objetivo, CARGA/DESCARGA piden confirmación. */
export const UMBRAL_CONFIRMAR_M = 300;
export const EVENTO_DESHECHO = "deshecho";

export type PasoConductor = "salir" | "cargar" | "descargar";
export interface InfoDeshacer { paso: PasoConductor; evento: string; hacia: EstadoServicio; nombre: string }
/** Según el estado actual: qué paso se deshace, qué evento lo registró y a qué estado se vuelve. */
export const DESHACER: Partial<Record<EstadoServicio, InfoDeshacer>> = {
  en_camino: { paso: "salir", evento: "en_camino", hacia: "aceptado", nombre: "salida" },
  recogido: { paso: "cargar", evento: "recogido", hacia: "en_camino", nombre: "carga" },
  completado: { paso: "descargar", evento: "completado", hacia: "recogido", nombre: "descarga" },
};

/** Eventos que registran una acción (de la central, del conductor o del servidor). Los informativos (llegando, vuelos, retraso) no cuentan. */
const TIPOS_ACCION = new Set(["creado", "asignado", "reasignado", "aceptado", "rechazado", "expirado", "en_camino", "recogido",
  "completado", "cancelado", "subcontratado", EVENTO_DESHECHO]);

export interface EventoPaso { id?: number; tipo: string; actor_id: string | null; creado_en: string }

/** Último evento de acción del servicio (por instante y, a igualdad, por id). */
export function ultimoEventoAccion<E extends EventoPaso>(eventos: readonly E[]): E | null {
  let mejor: E | null = null;
  for (const e of eventos) {
    if (!TIPOS_ACCION.has(e.tipo)) continue;
    if (!mejor) { mejor = e; continue; }
    const d = Date.parse(e.creado_en) - Date.parse(mejor.creado_en);
    if (d > 0 || (d === 0 && (e.id ?? 0) > (mejor.id ?? 0))) mejor = e;
  }
  return mejor;
}

export type ComprobacionDeshacer =
  | { ok: true; hacia: EstadoServicio; nombre: string; motivo: string; restanteMs: number | null }
  | { ok: false; error: string };

/**
 * ¿Se puede deshacer ahora? `quien.central`: la central (sin límite de tiempo). Si no, el conductor `quien.id`:
 * el último evento de acción debe ser su paso (el que llevó al estado actual) y de hace ≤ 10 min.
 */
export function comprobarDeshacer(estado: EstadoServicio, eventos: readonly EventoPaso[], quien: { id: string; central?: boolean }, ahora: Date): ComprobacionDeshacer {
  const d = DESHACER[estado];
  if (!d) return { ok: false, error: "No hay ningún paso que deshacer en este servicio" };
  if (quien.central) return { ok: true, hacia: d.hacia, nombre: d.nombre, motivo: `Deshecho por la central: ${d.nombre}`, restanteMs: null };
  const ult = ultimoEventoAccion(eventos);
  if (!ult || ult.tipo !== d.evento) {
    return ult && ult.actor_id !== quien.id
      ? { ok: false, error: "La central ha cambiado el servicio después: pídele que lo corrija" }
      : { ok: false, error: "Solo puedes deshacer tu último paso" };
  }
  if (ult.actor_id !== quien.id) return { ok: false, error: "Ese paso no lo hiciste tú: pide a la central que lo corrija" };
  const restanteMs = VENTANA_DESHACER_MS - (ahora.getTime() - Date.parse(ult.creado_en));
  if (!(restanteMs > 0)) return { ok: false, error: "Han pasado más de 10 minutos: pide a la central que lo deshaga" };
  return { ok: true, hacia: d.hacia, nombre: d.nombre, motivo: `Deshecho por el conductor: ${d.nombre}`, restanteMs };
}

/** Tiempo que le queda al conductor para deshacer (ms) o null si ya no puede. Para el botón «↩ Deshacer (quedan 9:41)». */
export function restanteDeshacerMs(estado: EstadoServicio, ultimo: EventoPaso | null, conductorId: string, ahora: Date): number | null {
  if (!ultimo) return null;
  const c = comprobarDeshacer(estado, [ultimo], { id: conductorId }, ahora);
  return c.ok ? c.restanteMs : null;
}

/** 581 000 ms → «9:41». */
export function formatoCuentaAtras(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Texto de la confirmación de «deshacer» (conductor y central). */
export function preguntaDeshacer(estado: EstadoServicio): string | null {
  const d = DESHACER[estado];
  if (!d) return null;
  const vuelve: Record<PasoConductor, string> = {
    salir: "volverá a «aceptado» (aún sin salir)", cargar: "volverá a «en camino» (sin pasajeros a bordo)",
    descargar: "volverá a «pasajeros a bordo» (sin terminar)",
  };
  return `¿Deshacer la ${d.nombre}? El servicio ${vuelve[d.paso]}.`;
}

/** Del motivo del evento «deshecho»: qué paso se deshizo y si fue la central. */
export function leerDeshecho(motivo: string | null | undefined): { nombre: string | null; central: boolean } {
  const m = /^Deshecho por (la central|el conductor):\s*(salida|carga|descarga)\s*$/i.exec(motivo?.trim() ?? "");
  return { nombre: m ? m[2].toLowerCase() : null, central: !!m && m[1].toLowerCase() === "la central" };
}

/**
 * Prevención del toque sin querer: CARGA lejos de la recogida o DESCARGA lejos del destino (> 300 m según el GPS)
 * piden confirmación. Sin GPS, sin coordenadas o con la distancia de otro objetivo: null (sin confirmación extra).
 */
export function confirmacionDistancia(accion: string, cerca: { tipo: TipoObjetivo; distanciaM: number } | null | undefined, umbralM = UMBRAL_CONFIRMAR_M): string | null {
  const tipo: TipoObjetivo | null = accion === "cargar" ? "recogida" : accion === "descargar" ? "destino" : null;
  if (!tipo || !cerca || cerca.tipo !== tipo || !Number.isFinite(cerca.distanciaM) || cerca.distanciaM <= umbralM) return null;
  const d = formatoDistancia(cerca.distanciaM);
  return tipo === "destino" ? `Aún estás a ${d} del destino. ¿Finalizar igualmente?` : `Aún estás a ${d} de la recogida. ¿Marcar CARGA igualmente?`;
}
