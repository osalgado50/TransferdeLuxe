/**
 * Movimiento de la demo (lógica pura): cada coche de demo hace su servicio como un conductor de verdad — acepta,
 * sale hacia la recogida, avisa de que llega, recoge, lleva al cliente y termina — siguiendo la carretera
 * (rutas de OpenStreetMap calculadas de antemano). El servidor (demoViva) aplica los pasos y publica las posiciones.
 */
import { distanciaKm } from "@/lib/dominio/geo";
import type { Punto } from "@/lib/dominio/tipos";
import { aparcamiento, LUGARES_DEMO, MOTIVO_SIMULADO } from "./datosDemo";
import { RUTAS_CARRETERA } from "./rutasCarretera";

const MIN = 60_000;
export { MOTIVO_SIMULADO };
/** Un conductor de demo acepta solo a los 4 min si nadie lo hace antes; sale 20 min antes; avisa 4 min antes de llegar. */
export const ACEPTA_TRAS_MS = 4 * MIN;
export const SALE_ANTES_MS = 20 * MIN;
export const AVISA_ANTES_MS = 4 * MIN;
const LEJOS_KM = 40;
/** Velocidades medias máximas: si no le da tiempo, llega tarde (y salta el aviso de retraso, como en la realidad). */
const KMH_DE_CAMINO = 60, KMH_CON_CLIENTE = 90;

export interface ServicioEnMapa {
  id: string; estado: string; conductor_id: string | null; duracion_estimada_min: number | null;
  fecha_hora_recogida: string; asignado_en: string | null;
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
}

// ── Rutas ──
const lugares = Object.entries(LUGARES_DEMO);
/** Lugar de la demo a menos de 400 m del punto (las rutas están calculadas entre lugares). */
function lugarDe(p: Punto): string | null {
  for (const [k, l] of lugares) if (distanciaKm(p, l) < 0.4) return k;
  return null;
}
/** Ruta por carretera entre dos puntos de la demo; si no es un par conocido, en línea recta. */
export function rutaEntre(a: Punto, b: Punto): Punto[] {
  const ka = lugarDe(a), kb = lugarDe(b);
  if (ka && kb && ka !== kb) {
    const ida = RUTAS_CARRETERA[`${ka}|${kb}`];
    if (ida) return ida.map(([lat, lng]) => ({ lat, lng }));
    const vuelta = RUTAS_CARRETERA[`${kb}|${ka}`];
    if (vuelta) return [...vuelta].reverse().map(([lat, lng]) => ({ lat, lng }));
  }
  return [a, b];
}
export const longitudKm = (r: Punto[]) => r.slice(1).reduce((t, p, i) => t + distanciaKm(r[i], p), 0);
/** Punto a la fracción `f` (0–1) del recorrido, medida en distancia. */
export function puntoEnRuta(r: Punto[], f: number): Punto {
  if (r.length === 1 || f <= 0) return r[0];
  let falta = Math.min(1, f) * longitudKm(r);
  for (let i = 1; i < r.length; i++) {
    const d = distanciaKm(r[i - 1], r[i]);
    if (falta <= d || i === r.length - 1) {
      const g = d ? Math.min(1, falta / d) : 1;
      return { lat: r[i - 1].lat + (r[i].lat - r[i - 1].lat) * g, lng: r[i - 1].lng + (r[i].lng - r[i - 1].lng) * g };
    }
    falta -= d;
  }
  return r[r.length - 1];
}

// ── Servicio en curso ──
const t = (iso: string) => Date.parse(iso);
const origenDe = (s: ServicioEnMapa): Punto | null => (s.origen_lat != null && s.origen_lng != null ? { lat: s.origen_lat, lng: s.origen_lng } : null);
const destinoDe = (s: ServicioEnMapa): Punto | null => (s.destino_lat != null && s.destino_lng != null ? { lat: s.destino_lat, lng: s.destino_lng } : null);

/**
 * Dónde está aparcado el coche cuando no lleva servicio: en el destino de su último servicio terminado (los coches se
 * quedan donde dejan al cliente) o, si aún no ha hecho ninguno, en su aparcamiento.
 */
export function aparcadoEn(suyos: ServicioEnMapa[], indice: number, antesDe = Infinity): Punto {
  const hechos = suyos.filter((s) => s.estado === "completado" && t(s.fecha_hora_recogida) < antesDe && destinoDe(s))
    .sort((a, b) => t(b.fecha_hora_recogida) - t(a.fecha_hora_recogida));
  const base = aparcamiento(indice);
  if (!hechos.length) return base;
  // Tras un viaje largo (aeropuerto de Barcelona, Miami…) vuelve a su base: si no, saldría del mapa o cruzaría media
  // provincia en minutos para la siguiente recogida.
  const fin = destinoDe(hechos[0])!;
  return distanciaKm(fin, base) > LEJOS_KM ? base : fin;
}

/** Tramo que recorre ahora: hacia la recogida (de camino) o hacia el destino (con pasajeros). `pasoEn`: hora del paso. */
export function tramoDemo(s: ServicioEnMapa, salida: Punto, pasoEn: number | null): { ruta: Punto[]; inicio: number; fin: number } | null {
  const o = origenDe(s), d = destinoDe(s);
  if (!o) return null;
  if (s.estado === "en_camino") {
    const inicio = pasoEn ?? t(s.fecha_hora_recogida) - SALE_ANTES_MS;
    const ruta = rutaEntre(salida, o);
    return { ruta, inicio, fin: Math.max(t(s.fecha_hora_recogida), inicio + Math.max(5 * MIN, (longitudKm(ruta) / KMH_DE_CAMINO) * 3600e3)) };
  }
  if (s.estado === "recogido" && d) {
    const inicio = pasoEn ?? t(s.fecha_hora_recogida);
    const ruta = rutaEntre(o, d);
    return { ruta, inicio, fin: inicio + Math.max(Math.max(10, s.duracion_estimada_min ?? 30) * MIN, (longitudKm(ruta) / KMH_CON_CLIENTE) * 3600e3) };
  }
  return null;
}

/** Posición y velocidad del coche ahora: sobre su tramo según el tiempo transcurrido, o parado donde esté. */
export function posicionDemo(tramo: ReturnType<typeof tramoDemo>, parado: Punto, ahora: number): { lat: number; lng: number; velocidad: number } {
  if (!tramo) return { lat: parado.lat, lng: parado.lng, velocidad: 0 };
  const f = Math.max(0, Math.min(1, (ahora - tramo.inicio) / (tramo.fin - tramo.inicio)));
  const p = puntoEnRuta(tramo.ruta, f);
  const horas = (tramo.fin - tramo.inicio) / 3600e3;
  return { lat: p.lat, lng: p.lng, velocidad: f < 1 ? Math.round(longitudKm(tramo.ruta) / horas) : 0 };
}

export type PasoDemo = { tipo: "accion"; accion: "aceptar" | "salir" | "cargar" | "descargar" } | { tipo: "aviso"; evento: "llegando_recogida" | "llegando_destino" };
/** Siguiente paso que daría el conductor de demo ahora (o nada). `avisado`: ya avisó de que llegaba en este tramo. */
export function siguientePasoDemo(s: ServicioEnMapa, tramo: ReturnType<typeof tramoDemo>, avisado: boolean, ahora: number): PasoDemo | null {
  if (!s.conductor_id) return null;
  if (s.estado === "asignado") return s.asignado_en && ahora - t(s.asignado_en) >= ACEPTA_TRAS_MS ? { tipo: "accion", accion: "aceptar" } : null;
  if (s.estado === "aceptado") return ahora >= t(s.fecha_hora_recogida) - SALE_ANTES_MS ? { tipo: "accion", accion: "salir" } : null;
  if (!tramo) return null;
  if (ahora >= tramo.fin) return { tipo: "accion", accion: s.estado === "en_camino" ? "cargar" : "descargar" };
  if (!avisado && ahora >= tramo.fin - AVISA_ANTES_MS) return { tipo: "aviso", evento: s.estado === "en_camino" ? "llegando_recogida" : "llegando_destino" };
  return null;
}

/** De camino: sale de donde estaba aparcado; si es casi la misma recogida (sin tramo que recorrer), del aparcamiento siguiente. */
export function salidaHacia(s: ServicioEnMapa, suyos: ServicioEnMapa[], indice: number): Punto {
  const base = aparcadoEn(suyos, indice, t(s.fecha_hora_recogida));
  const o = origenDe(s);
  return o && distanciaKm(base, o) < 3 ? aparcamiento(indice + 1) : base;
}
