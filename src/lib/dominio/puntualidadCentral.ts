import type { Punto } from "./tipos";
import { calcularPuntualidad, formatoMinutos, ESTADOS_PUNTUALIDAD, type EstadoPuntualidad } from "./puntualidad";
import { aPlan, tiempoTraslado, type FilaPlan } from "./planificacion";
import { CARGA_MIN, tipoPunto } from "./duracion";

/**
 * Semáforo de puntualidad para la central (lógica pura; web, API /api/central/resumen y app nativa):
 * para cada servicio asignado / aceptado / en camino, ¿llega el conductor a la recogida?
 *  · Con GPS reciente: desde su posición actual, encadenando lo que tenga antes (lo que lleva a bordo y servicios previos).
 *  · Sin GPS reciente: por hora y plan (fin previsto del servicio anterior + traslado) y se marca «sin GPS».
 * Modelo de traslado: recta × 1,3 a 70 km/h (sin llamadas a OSRM). Clasificación: la de puntualidad.ts (la misma que ve
 * el conductor): tarde si llega > 2 min después, justo con < 5 min de margen, a tiempo el resto.
 */
export type EstadoIndicador = EstadoPuntualidad | "sin_gps";
export interface IndicadorPuntualidad {
  estado: EstadoIndicador;
  /** «a tiempo · 12 min de margen», «justo · 3 min», «retraso +8 min», «sin GPS». */
  texto: string;
  margenMin: number | null; retrasoMin: number;
  llegadaEstimada: string | null;
  /** false: calculado por el plan (no hay posición reciente) → la UI añade «sin GPS» en gris. */
  conGps: boolean;
}

export type ServicioPuntualidad = FilaPlan & { estado: string; conductor_id: string | null };
export interface PosicionPuntualidad { conductor_id: string; lat: number; lng: number; en_servicio: boolean; registrado_en: string }

const MIN = 60_000;
const ACTIVOS = ["asignado", "aceptado", "en_camino", "recogido"];

export const COLOR_INDICADOR: Record<EstadoIndicador, { fondo: string; texto: string }> = {
  a_tiempo: { fondo: "#16a34a", texto: "#ffffff" },
  justo: { fondo: "#f59e0b", texto: "#0f172a" },
  tarde: { fondo: "#dc2626", texto: "#ffffff" },
  sin_gps: { fondo: "#475569", texto: "#e2e8f0" },
};
export const ETIQUETA_INDICADOR: Record<EstadoIndicador, string> = { a_tiempo: "a tiempo", justo: "justo", tarde: "retraso", sin_gps: "sin GPS" };

/** GPS útil: interruptor «En servicio» y última posición más reciente que el umbral «sin señal». */
export function gpsReciente(p: PosicionPuntualidad | undefined, ahora: number, umbralMin: number): Punto | null {
  if (!p || !p.en_servicio) return null;
  const edad = ahora - Date.parse(p.registrado_en);
  return Number.isFinite(edad) && edad < umbralMin * MIN ? { lat: p.lat, lng: p.lng } : null;
}

function texto(estado: EstadoPuntualidad, margen: number, retraso: number): string {
  if (estado === "tarde") return `retraso +${formatoMinutos(retraso)}`;
  if (estado === "justo") return `justo · ${formatoMinutos(Math.max(0, margen))}`;
  return `a tiempo · ${formatoMinutos(margen)} de margen`;
}

/**
 * Indicadores por id de servicio. `servicios`: los activos (asignado…recogido) de los conductores implicados, incluido lo
 * que lleven en curso; solo se devuelve indicador para asignado / aceptado / en camino.
 */
export function indicadoresPuntualidad(e: {
  servicios: ServicioPuntualidad[]; posiciones: PosicionPuntualidad[]; ahora: number | Date; umbralGpsMin: number;
}): Record<string, IndicadorPuntualidad> {
  const ahora = e.ahora instanceof Date ? e.ahora.getTime() : e.ahora;
  const res: Record<string, IndicadorPuntualidad> = {};
  const porConductor = new Map<string, ServicioPuntualidad[]>();
  for (const s of e.servicios) {
    if (!s.conductor_id || !ACTIVOS.includes(s.estado)) continue;
    porConductor.set(s.conductor_id, [...(porConductor.get(s.conductor_id) ?? []), s]);
  }
  for (const [cid, lista] of porConductor) {
    const gps = gpsReciente(e.posiciones.find((p) => p.conductor_id === cid), ahora, e.umbralGpsMin);
    // Primero lo que lleva a bordo; después el resto por hora de recogida.
    const orden = [...lista].sort((a, b) => (a.estado === "recogido" ? 0 : 1) - (b.estado === "recogido" ? 0 : 1)
      || Date.parse(a.fecha_hora_recogida) - Date.parse(b.fecha_hora_recogida) || (a.id < b.id ? -1 : 1));
    let cursor: { punto: Punto | null; t: number } | null = gps ? { punto: gps, t: ahora } : null;
    for (const s of orden) {
      const p = aPlan(s);
      const recogida = p.inicio.getTime();
      if (s.estado === "recogido") {
        // En curso: termina al llegar al destino (+ descarga).
        const descarga = CARGA_MIN[tipoPunto(s.destino_texto, p.destino)];
        const tr = cursor?.punto && p.destino ? tiempoTraslado(cursor.punto, p.destino) : null;
        const finT = tr != null ? Math.max(cursor!.t, ahora) + (tr + descarga) * MIN : Math.max(ahora, recogida + p.duracionMin * MIN);
        cursor = { punto: p.destino, t: finT };
        continue;
      }
      let llegada: number | null = null;
      if (cursor) {
        const tr = tiempoTraslado(cursor.punto, p.origen);
        if (tr != null) llegada = Math.max(cursor.t, ahora) + tr * MIN;
      }
      if ((ESTADOS_PUNTUALIDAD as readonly string[]).includes(s.estado)) {
        const conGps = !!gps;
        if (llegada == null) {
          const pu = calcularPuntualidad({ estado: s.estado, recogida, ahora });
          res[s.id] = ahora > recogida
            ? { estado: "tarde", texto: texto("tarde", 0, pu.minutosRetraso), margenMin: null, retrasoMin: pu.minutosRetraso, llegadaEstimada: null, conGps }
            : { estado: "sin_gps", texto: "sin GPS", margenMin: null, retrasoMin: 0, llegadaEstimada: null, conGps: false };
        } else {
          const pu = calcularPuntualidad({ estado: s.estado, recogida, ahora, etaS: (llegada - ahora) / 1000 });
          const margen = Math.floor((recogida - llegada) / MIN);
          const est = pu.estado ?? "a_tiempo";
          res[s.id] = { estado: est, texto: texto(est, margen, pu.minutosRetraso), margenMin: margen, retrasoMin: est === "tarde" ? pu.minutosRetraso : 0,
            llegadaEstimada: new Date(llegada).toISOString(), conGps };
        }
      }
      // El servicio empieza al llegar (o a su hora si llega antes) y dura lo planificado.
      cursor = { punto: p.destino, t: Math.max(llegada ?? recogida, recogida) + p.duracionMin * MIN };
    }
  }
  return res;
}

/** Cuántos van tarde / justos entre los indicadores dados (para el contador «En curso»). */
export function resumenIndicadores(ind: (IndicadorPuntualidad | undefined)[]): { tarde: number; justo: number } {
  return { tarde: ind.filter((i) => i?.estado === "tarde").length, justo: ind.filter((i) => i?.estado === "justo").length };
}
