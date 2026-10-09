import type { Punto } from "./tipos";

const R = 6371;
const rad = (g: number) => (g * Math.PI) / 180;

export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const FACTOR_CARRETERA = 1.3, VELOCIDAD_MEDIA_KMH = 70, MARGEN_MIN = 10;

export function duracionEstimadaMin(a: Punto, b: Punto): number {
  const min = Math.ceil(((distanciaKm(a, b) * FACTOR_CARRETERA) / VELOCIDAD_MEDIA_KMH) * 60) + MARGEN_MIN;
  return Math.max(15, min);
}

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
export function diaMadrid(fecha: string | Date): string {
  return fmtDia.format(typeof fecha === "string" ? new Date(fecha) : fecha);
}
