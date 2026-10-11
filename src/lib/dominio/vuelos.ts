// Seguimiento de vuelos: lógica pura (sin red ni BD).
import type { EstadoServicio } from "./tipos";

/** Código IATA (2) o ICAO (3) de aerolínea, letras/dígitos con al menos una letra, + 1-4 dígitos. */
const FORMATO = /^(?=[A-Z0-9]{2,3}\d)(?:[A-Z]{2,3}|[A-Z]\d|\d[A-Z])\d{1,4}$/;

/** Normaliza (mayúsculas, sin espacios ni guiones). Devuelve null si está vacío o el formato no es válido. */
export function normalizarVuelo(v: string | null | undefined): string | null {
  const n = (v ?? "").toUpperCase().replace(/[\s-]+/g, "");
  return FORMATO.test(n) ? n : null;
}

export const vueloVacio = (v: string | null | undefined) => !(v ?? "").trim();

export const MENSAJE_VUELO = "Formato de vuelo no válido (p. ej. FR1234 o VLG8120)";

export const urlVuelo = (codigo: string) => `https://www.flightradar24.com/data/flights/${encodeURIComponent(codigo.toLowerCase())}`;

export const MARGEN_EQUIPAJE_MIN = 20;

/** Estados en los que ya no se reajusta la recogida. */
const CERRADOS: EstadoServicio[] = ["recogido", "completado", "cancelado", "subcontratado"];
export const admiteReajuste = (estado: EstadoServicio) => !CERRADOS.includes(estado);

/**
 * Nueva hora de recogida = llegada real + margen (redondeada al minuto). null si no procede
 * (servicio cerrado, margen inválido o coincide con la actual).
 */
export function calcularNuevaRecogida(p: { llegadaReal: Date; margenMin?: number; recogidaActual: Date; estado: EstadoServicio }): Date | null {
  if (!admiteReajuste(p.estado) || isNaN(p.llegadaReal.getTime())) return null;
  const margen = Number.isFinite(p.margenMin) && p.margenMin! >= 0 && p.margenMin! <= 180 ? p.margenMin! : MARGEN_EQUIPAJE_MIN;
  const t = Math.round((p.llegadaReal.getTime() + margen * 60_000) / 60_000) * 60_000;
  return t === Math.round(p.recogidaActual.getTime() / 60_000) * 60_000 ? null : new Date(t);
}
