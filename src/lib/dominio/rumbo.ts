import { distanciaKm } from "./geo";
import type { Punto } from "./tipos";

/**
 * Navegación «rumbo arriba» del conductor (lógica pura, compartida por la web y la app): hacia dónde va el coche, dónde
 * está el próximo giro o rotonda de la ruta y qué zoom poner (más cerca al llegar a un cruce, más lejos en autovía).
 */

const rad = (g: number) => (g * Math.PI) / 180;
const m = (a: Punto, b: Punto) => distanciaKm(a, b) * 1000;

/** Rumbo de a hacia b en grados (0 = norte, 90 = este). */
export function rumbo(a: Punto, b: Punto): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** Giro de a a b en grados, entre -180 y 180 (positivo = a la derecha). */
export const difAngulo = (a: number, b: number) => ((b - a + 540) % 360) - 180;

export interface Recorrido { pts: Punto[]; acum: number[]; total: number }
/** Ruta [lat, lng][] con la distancia acumulada en cada vértice (para moverse por ella en metros). */
export function prepararRuta(coords: readonly (readonly [number, number])[]): Recorrido {
  const pts = coords.map(([lat, lng]) => ({ lat, lng }));
  const acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + m(pts[i - 1], pts[i]));
  return { pts, acum, total: acum.at(-1) ?? 0 };
}

/** Punto de la ruta a `s` metros del inicio. */
export function puntoEnRecorrido(r: Recorrido, s: number): Punto {
  if (r.pts.length === 1 || s <= 0) return r.pts[0];
  if (s >= r.total) return r.pts[r.pts.length - 1];
  let lo = 0, hi = r.acum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r.acum[mid] <= s) lo = mid; else hi = mid; }
  const tramo = r.acum[hi] - r.acum[lo];
  const t = tramo ? (s - r.acum[lo]) / tramo : 0;
  const a = r.pts[lo], b = r.pts[hi];
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Dónde está la posición sobre la ruta: metros desde el inicio (`s`) y a cuánto queda de ella (`desvioM`). */
export function situarEnRuta(r: Recorrido, pos: Punto): { s: number; desvioM: number } {
  if (r.pts.length < 2) return { s: 0, desvioM: r.pts.length ? m(pos, r.pts[0]) : Infinity };
  let mejor = { s: 0, d: Infinity };
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const k = Math.cos(rad(a.lat));
    const dx = (b.lng - a.lng) * k, dy = b.lat - a.lat, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(1, Math.max(0, (((pos.lng - a.lng) * k) * dx + (pos.lat - a.lat) * dy) / l2)) : 0;
    const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = m(pos, q);
    if (d < mejor.d) mejor = { s: r.acum[i] + (r.acum[i + 1] - r.acum[i]) * t, d };
  }
  return { s: mejor.s, desvioM: mejor.d };
}

/** Rumbo de la ruta justo por delante de `s` (los próximos ~25 m). */
export function rumboRutaEn(r: Recorrido, s: number, tramo = 25): number | null {
  if (r.total <= 0) return null;
  const a = puntoEnRecorrido(r, Math.min(s, r.total - 1)), b = puntoEnRecorrido(r, Math.min(r.total, s + tramo));
  return m(a, b) < 1 ? null : rumbo(a, b);
}

/**
 * Próximo cruce, giro, rotonda o cambio de sentido por delante: el primer punto en el que la dirección de la ruta cambia
 * al menos `umbral` grados entre los 25 m anteriores y los 25 m siguientes (así una curva suave no cuenta y una rotonda
 * sí). Devuelve a cuántos metros está y cuánto gira; null si no hay ninguno en el `alcanceM`.
 */
export function siguienteGiro(r: Recorrido, s: number, o: { alcanceM?: number; paso?: number; ventana?: number; umbral?: number } = {}): { distanciaM: number; angulo: number } | null {
  const { alcanceM = 1200, paso = 10, ventana = 25, umbral = 40 } = o;
  const hasta = Math.min(s + alcanceM, r.total - ventana);
  for (let x = s + paso; x <= hasta; x += paso) {
    const antes = puntoEnRecorrido(r, x - ventana), aqui = puntoEnRecorrido(r, x), despues = puntoEnRecorrido(r, x + ventana);
    if (m(antes, aqui) < 5 || m(aqui, despues) < 5) continue;
    const angulo = difAngulo(rumbo(antes, aqui), rumbo(aqui, despues));
    if (Math.abs(angulo) >= umbral) return { distanciaM: x - s, angulo: Math.round(angulo) };
  }
  return null;
}

/**
 * Rumbo del coche: el del GPS cuando va en marcha (a baja velocidad el GPS da rumbos al azar); parado o despacio, el de
 * la ruta si va sobre ella; si no, se mantiene el anterior (el mapa no da vueltas en un semáforo).
 */
export function rumboCoche(o: { gps: number | null; velocidadMs: number | null; ruta: number | null; desvioM: number | null; anterior: number | null }): number | null {
  if (o.gps != null && o.gps >= 0 && o.velocidadMs != null && o.velocidadMs >= 2.5) return o.gps;
  if (o.ruta != null && o.desvioM != null && o.desvioM < 40) return o.ruta;
  return o.anterior;
}

/** Zoom del mapa: más lejos cuanto más rápido; al acercarse a un giro (≈15 s antes, mínimo 120 m), de cerca. */
export function zoomNavegacion(o: { velocidadKmh: number | null; giroM: number | null }): number {
  const v = o.velocidadKmh ?? 0;
  const base = v < 25 ? 16.4 : v < 50 ? 16 : v < 80 ? 15.2 : 14.4;
  const aviso = Math.max(120, (v / 3.6) * 15);
  return o.giroM != null && o.giroM <= aviso ? Math.max(base, 17.3) : base;
}
