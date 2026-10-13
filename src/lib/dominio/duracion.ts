import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";
import { ZONAS } from "./zonas";

/**
 * Duración estimada de un servicio (lógica pura, compartida por la web, la API y la app):
 * trayecto (ruta OSRM si ya está en caché; si no, recta × 1,3 a 70 km/h) + carga en el origen + descarga en el destino.
 * En aeropuertos y estaciones se tarda más (equipaje, buscar al cliente): 15 min; en el resto, 5 min.
 */
export type TipoPunto = "aeropuerto" | "estacion" | "otro";
export const CARGA_MIN: Record<TipoPunto, number> = { aeropuerto: 15, estacion: 15, otro: 5 };
export const DURACION_MINIMA_MIN = 15;
/** Sin coordenadas ni duración guardada. */
export const DURACION_POR_DEFECTO_MIN = 45;
/** Margen mínimo por defecto entre servicios (ajustes.margen_minimo_min). */
export const MARGEN_MINIMO_DEFECTO_MIN = 15;
const FACTOR_CARRETERA = 1.3, VELOCIDAD_MEDIA_KMH = 70;
/** Radio (km) alrededor de un aeropuerto/estación conocido para considerarlo ese lugar aunque el texto no lo diga. */
const RADIO_LUGAR_KM = 1.2;

const AEROPUERTO = /\b(aeropuert\w*|aeroport\w*|airport|terminal\s*[12]\b|t[12]\b)/i;
const ESTACION = /\b(estaci[oó]n?(?![a-zà-ÿ])|renfe\b|adif\b|train station)/i;
const LUGARES = ZONAS.filter((z) => /^(aeropuerto|estaci)/i.test(z.nombre))
  .map((z) => ({ ...z, tipo: (/^aeropuerto/i.test(z.nombre) ? "aeropuerto" : "estacion") as TipoPunto }));

/** Tipo de punto por el texto («Aeropuerto de Reus», «Estació Camp de Tarragona») o por estar junto a uno conocido. */
export function tipoPunto(texto?: string | null, punto?: Punto | null): TipoPunto {
  const t = (texto ?? "").normalize("NFC");
  if (AEROPUERTO.test(t)) return "aeropuerto";
  if (ESTACION.test(t)) return "estacion";
  if (punto) for (const l of LUGARES) if (distanciaKm(punto, l) <= RADIO_LUGAR_KM) return l.tipo;
  return "otro";
}

/** Minutos de trayecto: la ruta en caché si la hay (minutos > 0), si no el modelo recta × 1,3 a 70 km/h; null sin coordenadas. */
export function trayectoMin(origen: Punto | null, destino: Punto | null, rutaMin?: number | null): number | null {
  if (rutaMin != null && Number.isFinite(rutaMin) && rutaMin > 0) return Math.ceil(rutaMin);
  if (!origen || !destino) return null;
  return Math.ceil(((distanciaKm(origen, destino) * FACTOR_CARRETERA) / VELOCIDAD_MEDIA_KMH) * 60);
}

export interface DesgloseDuracion {
  trayectoMin: number | null; cargaMin: number; descargaMin: number; totalMin: number;
  /** De dónde sale el trayecto: ruta en caché, modelo, o la duración guardada (sin coordenadas). */
  fuente: "ruta" | "modelo" | "guardada";
  tipoOrigen: TipoPunto; tipoDestino: TipoPunto;
}

export interface DatosDuracion {
  origen: Punto | null; destino: Punto | null; origenTexto?: string | null; destinoTexto?: string | null;
  /** Minutos de la ruta OSRM si ya está en caché (no se pide nada aquí). */
  rutaMin?: number | null;
  /** duracion_estimada_min guardada: se usa sin coordenadas. */
  guardadaMin?: number | null;
}

export function duracionServicio(d: DatosDuracion): DesgloseDuracion {
  const tipoOrigen = tipoPunto(d.origenTexto, d.origen), tipoDestino = tipoPunto(d.destinoTexto, d.destino);
  const cargaMin = CARGA_MIN[tipoOrigen], descargaMin = CARGA_MIN[tipoDestino];
  const tr = trayectoMin(d.origen, d.destino, d.rutaMin);
  if (tr == null) {
    const g = d.guardadaMin != null && d.guardadaMin > 0 ? d.guardadaMin : DURACION_POR_DEFECTO_MIN;
    return { trayectoMin: null, cargaMin, descargaMin, totalMin: Math.max(DURACION_MINIMA_MIN, g), fuente: "guardada", tipoOrigen, tipoDestino };
  }
  const fuente = d.rutaMin != null && d.rutaMin > 0 ? "ruta" : "modelo";
  return { trayectoMin: tr, cargaMin, descargaMin, totalMin: Math.max(DURACION_MINIMA_MIN, tr + cargaMin + descargaMin), fuente, tipoOrigen, tipoDestino };
}

/**
 * Duración con la que se planifica: nunca menos que la guardada (servicios antiguos o ajustados) ni que la calculada
 * ahora (aeropuertos y estaciones suman más carga). Así el plan es conservador y el conductor llega.
 */
export function duracionEfectiva(d: DatosDuracion): number {
  const calc = duracionServicio(d);
  const guardada = d.guardadaMin != null && d.guardadaMin > 0 ? d.guardadaMin : 0;
  return calc.fuente === "guardada" ? calc.totalMin : Math.max(guardada, calc.totalMin);
}

const NOMBRE: Record<TipoPunto, string> = { aeropuerto: "aeropuerto", estacion: "estación", otro: "" };
/** «≈ 50 min (trayecto 30 + carga 15 en aeropuerto + descarga 5)». */
export function textoDuracion(x: DesgloseDuracion, totalMin = x.totalMin): string {
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  const total = h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  if (x.trayectoMin == null) return `≈ ${total} (sin coordenadas: duración guardada)`;
  const en = (t: TipoPunto) => (t === "otro" ? "" : ` en ${NOMBRE[t]}`);
  return `≈ ${total} (trayecto ${x.trayectoMin}${x.fuente === "ruta" ? " por ruta" : ""} + carga ${x.cargaMin}${en(x.tipoOrigen)} + descarga ${x.descargaMin}${en(x.tipoDestino)})`;
}
