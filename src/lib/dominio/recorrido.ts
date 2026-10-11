// Recorrido real de un servicio (lógica pura, sin dependencias): de las posiciones GPS del conductor entre «en camino»
// (o «aceptado») y «completado» se descartan los puntos malos, se simplifica la línea y se calculan km y duración.
// Lo usa el vigilante del servidor para guardarlo en la tabla `recorridos` (las posiciones se purgan a los 30 días).
import { distanciaKm } from "./geo";

/** Posición tal como viene de la tabla `posiciones`. */
export interface PosicionGps { lat: number; lng: number; precision_m?: number | null; registrado_en: string }
export interface EventoRecorrido { tipo: string; creado_en: string }
/** [lng, lat], como GeoJSON (MapLibre lo usa tal cual; Leaflet lo invierte). */
export type PuntoLngLat = [number, number];

export interface VentanaRecorrido { inicio: string; recogido: string | null; fin: string }
export interface Recorrido {
  inicio: string; fin: string;
  /** Línea simplificada [lng, lat]. */
  puntos: PuntoLngLat[];
  /** Índice del punto de recogida en `puntos`: [0..corte] hacia la recogida, [corte..] con pasajeros. null si no se sabe. */
  corte: number | null;
  km: number; km_con_pasajeros: number | null; duracion_min: number; puntos_originales: number;
}

export const PRECISION_MAX_M = 100;
export const VELOCIDAD_MAX_KMH = 200;
export const TOLERANCIA_M = 15;
export const MAX_PUNTOS = 500;
/** Tras completar, el recorrido se recalcula (cada ≥ 2 min) durante 15 min: la cola offline del móvil sube posiciones tarde. */
export const REFRESCO_TRAS_FIN_MIN = 15;
export const REFRESCO_CADA_MIN = 2;

const ms = (iso: string) => Date.parse(iso);

/**
 * Ventana del viaje: el ÚLTIMO «completado» (si se deshizo y se volvió a completar, cuenta el nuevo), el último
 * «en_camino» anterior (o «aceptado» si no salió con el botón) y el último «recogido» entre ambos. null sin completar.
 */
export function ventanaRecorrido(eventos: EventoRecorrido[]): VentanaRecorrido | null {
  const ord = [...eventos].sort((a, b) => ms(a.creado_en) - ms(b.creado_en));
  const fin = ord.filter((e) => e.tipo === "completado").at(-1);
  if (!fin) return null;
  const antes = ord.filter((e) => ms(e.creado_en) <= ms(fin.creado_en));
  // Sin «en camino» ni «aceptado» (la central lo completó a mano): ventana vacía, para no reintentarlo sin fin.
  const ini = antes.filter((e) => e.tipo === "en_camino").at(-1) ?? antes.filter((e) => e.tipo === "aceptado").at(-1) ?? fin;
  const rec = antes.filter((e) => e.tipo === "recogido" && ms(e.creado_en) >= ms(ini.creado_en)).at(-1);
  return { inicio: ini.creado_en, recogido: rec?.creado_en ?? null, fin: fin.creado_en };
}

/**
 * Ordena por hora y descarta: precisión peor de 100 m, horas repetidas y saltos imposibles (> 200 km/h respecto al
 * último punto bueno; los saltos de menos de 50 m se toleran: es ruido del GPS con horas muy juntas). Si el punto
 * «bueno» era el raro (3 descartes seguidos coherentes entre sí), se descarta él y se sigue desde los nuevos.
 */
export function filtrarPosiciones(pos: PosicionGps[]): PosicionGps[] {
  const ord = pos
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !Number.isNaN(ms(p.registrado_en)))
    .filter((p) => p.precision_m == null || p.precision_m <= PRECISION_MAX_M)
    .sort((a, b) => ms(a.registrado_en) - ms(b.registrado_en));
  const ok: PosicionGps[] = [];
  let rechazados: PosicionGps[] = [];
  const posible = (a: PosicionGps, b: PosicionGps) => {
    const km = distanciaKm(a, b);
    if (km < 0.05) return true;
    const h = Math.max(1, (ms(b.registrado_en) - ms(a.registrado_en)) / 1000) / 3600;
    return km / h <= VELOCIDAD_MAX_KMH;
  };
  for (const p of ord) {
    const u = ok.at(-1);
    if (u && ms(p.registrado_en) === ms(u.registrado_en)) continue;
    if (!u || posible(u, p)) { ok.push(p); rechazados = []; continue; }
    rechazados.push(p);
    if (rechazados.length >= 3 && rechazados.every((r, i) => i === 0 || posible(rechazados[i - 1], r))) {
      ok.pop(); // el raro era el último bueno
      while (ok.length && !posible(ok.at(-1)!, rechazados[0])) ok.pop();
      ok.push(...rechazados);
      rechazados = [];
    }
  }
  return ok;
}

/** Distancia (m) de p al segmento a-b, en proyección plana local (suficiente a escala de una ciudad). */
function distSegmentoM(p: PuntoLngLat, a: PuntoLngLat, b: PuntoLngLat): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180), ky = 110_540;
  const ax = 0, ay = 0, bx = (b[0] - a[0]) * kx, by = (b[1] - a[1]) * ky, px = (p[0] - a[0]) * kx, py = (p[1] - a[1]) * ky;
  const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
  return Math.hypot(px - (ax + t * bx), py - (ay + t * by));
}

/** Douglas-Peucker iterativo (sin recursión: no revienta la pila con miles de puntos). Conserva extremos. */
export function douglasPeucker(puntos: PuntoLngLat[], toleranciaM: number): PuntoLngLat[] {
  if (puntos.length <= 2) return [...puntos];
  const guardar = new Uint8Array(puntos.length);
  guardar[0] = guardar[puntos.length - 1] = 1;
  const pila: [number, number][] = [[0, puntos.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop()!;
    let max = -1, k = -1;
    for (let x = i + 1; x < j; x++) {
      const d = distSegmentoM(puntos[x], puntos[i], puntos[j]);
      if (d > max) { max = d; k = x; }
    }
    if (k > 0 && max > toleranciaM) { guardar[k] = 1; pila.push([i, k], [k, j]); }
  }
  return puntos.filter((_, i) => guardar[i]);
}

export function kmDe(pos: { lat: number; lng: number }[]): number {
  let t = 0;
  for (let i = 1; i < pos.length; i++) t += distanciaKm(pos[i - 1], pos[i]);
  return t;
}
const redondeo2 = (n: number) => Math.round(n * 100) / 100;
const aLngLat = (p: PosicionGps): PuntoLngLat => [Math.round(p.lng * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6];

/**
 * Recorrido completo. Las posiciones pueden venir sin filtrar (se filtran aquí) y de más (se recortan a la ventana).
 * Dos tramos simplificados por separado y unidos en el punto de recogida (`corte`); si pasan de 500 puntos se sube
 * la tolerancia. Km por haversine sobre los puntos filtrados (no los simplificados: daría de menos).
 */
export function calcularRecorrido(posiciones: PosicionGps[], eventos: EventoRecorrido[],
  opc: { toleranciaM?: number; maxPuntos?: number } = {}): Recorrido | null {
  const v = ventanaRecorrido(eventos);
  if (!v) return null;
  const t0 = ms(v.inicio), t1 = ms(v.fin), tr = v.recogido ? ms(v.recogido) : null;
  const dentro = posiciones.filter((p) => { const t = ms(p.registrado_en); return t >= t0 && t <= t1; });
  const buenas = filtrarPosiciones(dentro);
  const duracion_min = Math.max(0, Math.round((t1 - t0) / 60_000));
  const base = { inicio: v.inicio, fin: v.fin, duracion_min, puntos_originales: dentro.length };
  if (buenas.length < 2) return { ...base, puntos: buenas.map(aLngLat), corte: null, km: 0, km_con_pasajeros: null };

  const a = tr == null ? buenas : buenas.filter((p) => ms(p.registrado_en) <= tr);
  const b0 = tr == null ? [] : buenas.filter((p) => ms(p.registrado_en) > tr);
  // El tramo con pasajeros arranca en el último punto antes de recoger (la línea no queda cortada).
  const b = b0.length && a.length ? [a[a.length - 1], ...b0] : b0;
  let tol = opc.toleranciaM ?? TOLERANCIA_M;
  const max = opc.maxPuntos ?? MAX_PUNTOS;
  let sa: PuntoLngLat[] = [], sb: PuntoLngLat[] = [];
  for (let n = 0; n < 30; n++) {
    sa = douglasPeucker(a.map(aLngLat), tol);
    sb = douglasPeucker(b.map(aLngLat), tol);
    if (sa.length + Math.max(0, sb.length - (sa.length ? 1 : 0)) <= max) break;
    tol *= 1.5;
  }
  const puntos = sa.length && sb.length ? [...sa, ...sb.slice(1)] : [...sa, ...sb];
  const corte = tr == null ? null : sa.length ? sa.length - 1 : 0;
  return {
    ...base, puntos, corte,
    km: redondeo2(kmDe(buenas)),
    km_con_pasajeros: tr == null ? null : redondeo2(kmDe(b)),
  };
}

/** Tramos para pintar: hacia la recogida (azul) y con pasajeros (rojo), unidos en la recogida. Sin corte, todo azul. */
export function tramosRecorrido(puntos: PuntoLngLat[], corte: number | null): { hacia: PuntoLngLat[]; con: PuntoLngLat[] } {
  if (corte == null || !puntos.length) return { hacia: puntos, con: [] };
  const c = Math.max(0, Math.min(Math.trunc(corte), puntos.length - 1));
  return { hacia: puntos.slice(0, c + 1), con: puntos.slice(c) };
}

/** ¿Hay que (re)calcular? Sin recorrido; con uno de otro «completado» (se deshizo y se volvió a completar); o en los
 * 15 min tras completar, como mucho cada 2 min, por si la cola offline del móvil sube posiciones con retraso. */
export function necesitaRecalculo(fin: string, guardado: { fin: string; calculado_en: string } | null, ahora: number): boolean {
  if (!guardado) return true;
  if (ms(guardado.fin) !== ms(fin)) return true;
  const calc = ms(guardado.calculado_en);
  return calc < ms(fin) + REFRESCO_TRAS_FIN_MIN * 60_000 && ahora - calc >= REFRESCO_CADA_MIN * 60_000;
}

/**
 * Proyección del recorrido a una caja de ancho×alto px (miniaturas SVG en la web, Views en la app). Equirectangular
 * con corrección por latitud y misma escala en los dos ejes (la forma no se deforma); y crece hacia abajo.
 */
export function proyectarRecorrido(puntos: PuntoLngLat[], ancho: number, alto: number, margen = 4): [number, number][] {
  if (!puntos.length) return [];
  const k = Math.cos((puntos[0][1] * Math.PI) / 180);
  const xs = puntos.map((p) => p[0] * k), ys = puntos.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-9), h = Math.max(maxY - minY, 1e-9);
  const esc = Math.min((ancho - 2 * margen) / w, (alto - 2 * margen) / h);
  const ox = (ancho - w * esc) / 2, oy = (alto - h * esc) / 2;
  return puntos.map((_, i) => [Math.round((ox + (xs[i] - minX) * esc) * 10) / 10, Math.round((oy + (maxY - ys[i]) * esc) * 10) / 10]);
}

export function textoKm(km: number | string | null | undefined): string {
  const n = Number(km ?? 0);
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
export function textoDuracion(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(min ?? 0));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Fila de la tabla `recorridos` tal como la leen las pantallas. */
export interface RecorridoGuardado {
  servicio_id: string; conductor_id: string | null; inicio: string; fin: string; puntos: PuntoLngLat[]; corte: number | null;
  km: number | string; km_con_pasajeros: number | string | null; duracion_min: number; puntos_originales: number;
}
export const CAMPOS_RECORRIDO = "servicio_id,conductor_id,inicio,fin,puntos,corte,km,km_con_pasajeros,duracion_min,puntos_originales";
/** Colores del recorrido: los mismos del mapa de flota (en camino azul, con pasajeros rojo). */
export const COLOR_HACIA = "#2563eb", COLOR_CON = "#dc2626";

type XY = [number, number];
/** Douglas-Peucker en píxeles (miniaturas): quita lo que no se ve. */
function simplificarPx(xy: XY[], tol: number): XY[] {
  if (xy.length <= 2) return xy;
  const keep = new Uint8Array(xy.length);
  keep[0] = keep[xy.length - 1] = 1;
  const pila: [number, number][] = [[0, xy.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop()!;
    const [ax, ay] = xy[i], [bx, by] = xy[j], l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    let max = -1, k = -1;
    for (let x = i + 1; x < j; x++) {
      const [px, py] = xy[x];
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
      const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
      if (d > max) { max = d; k = x; }
    }
    if (k > 0 && max > tol) { keep[k] = 1; pila.push([i, k], [k, j]); }
  }
  return xy.filter((_, i) => keep[i]);
}

/** Miniatura lista para pintar (SVG en la web, Views en la app): tramos en píxeles, con lo invisible ya quitado. */
export function miniaturaRecorrido(puntos: PuntoLngLat[], corte: number | null, ancho: number, alto: number, margen = 6):
  { hacia: XY[]; con: XY[]; inicio: XY; recogida: XY | null; fin: XY } | null {
  if (puntos.length < 2) return null;
  const xy = proyectarRecorrido(puntos, ancho, alto, margen);
  const { hacia, con } = tramosRecorrido(puntos, corte);
  const xyHacia = xy.slice(0, hacia.length), xyCon = con.length ? xy.slice(xy.length - con.length) : [];
  return {
    hacia: simplificarPx(xyHacia, 0.75), con: simplificarPx(xyCon, 0.75),
    inicio: xy[0], recogida: corte != null && hacia.length ? xy[hacia.length - 1] : null, fin: xy[xy.length - 1],
  };
}
