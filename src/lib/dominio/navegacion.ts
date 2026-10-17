import { distanciaKm } from "./geo";
import type { EstadoServicio, Punto } from "./tipos";

export type TipoObjetivo = "recogida" | "destino";
export interface Objetivo { tipo: TipoObjetivo; punto: Punto }
export type Fase = "lejos" | "cerca" | "llegado";

export const CERCA_M = 500, LLEGADO_M = 100, SALIR_CERCA_M = 600, SALIR_LLEGADO_M = 150;

type PuntosServicio = { origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null };

export function objetivoActual(estado: EstadoServicio, s: PuntosServicio): Objetivo | null {
  if (estado === "aceptado" || estado === "en_camino") {
    return s.origen_lat != null && s.origen_lng != null ? { tipo: "recogida", punto: { lat: s.origen_lat, lng: s.origen_lng } } : null;
  }
  if (estado === "recogido") {
    return s.destino_lat != null && s.destino_lng != null ? { tipo: "destino", punto: { lat: s.destino_lat, lng: s.destino_lng } } : null;
  }
  return null;
}

/** Fase de proximidad con histéresis: para salir de una fase hay que alejarse más de lo que costó entrar. */
export function faseProximidad(distanciaM: number, anterior: Fase = "lejos"): Fase {
  if (distanciaM <= LLEGADO_M) return "llegado";
  if (anterior === "llegado" && distanciaM <= SALIR_LLEGADO_M) return "llegado";
  if (distanciaM <= CERCA_M) return "cerca";
  if (anterior !== "lejos" && distanciaM <= SALIR_CERCA_M) return "cerca";
  return "lejos";
}

const dec1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function formatoDistancia(m: number): string {
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${dec1.format(m / 1000)} km`;
}
export function formatoDuracion(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

const m = (a: Punto, b: Punto) => distanciaKm(a, b) * 1000;

/** Proyección aproximada (plano local) de p sobre el segmento a-b: devuelve t∈[0,1]. */
function proyectar(p: Punto, a: Punto, b: Punto): number {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return 0;
  return Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
}

export interface Restante { restanteM: number; desvioM: number }
/** Distancia que queda por la polilínea desde el punto más cercano a la posición (más el tramo hasta ella). */
export function restanteEnRuta(coords: [number, number][], pos: Punto): Restante {
  const pts = coords.map(([lat, lng]) => ({ lat, lng }));
  if (pts.length === 0) return { restanteM: 0, desvioM: 0 };
  if (pts.length === 1) { const d = m(pos, pts[0]); return { restanteM: d, desvioM: 0 }; }
  let mejor = { i: 0, t: 0, d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const t = proyectar(pos, pts[i], pts[i + 1]);
    const q = { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t, lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * t };
    const d = m(pos, q);
    if (d < mejor.d) mejor = { i, t, d };
  }
  const a = pts[mejor.i], b = pts[mejor.i + 1];
  const q = { lat: a.lat + (b.lat - a.lat) * mejor.t, lng: a.lng + (b.lng - a.lng) * mejor.t };
  let resto = m(q, b);
  for (let i = mejor.i + 1; i < pts.length - 1; i++) resto += m(pts[i], pts[i + 1]);
  return { restanteM: resto + mejor.d, desvioM: mejor.d };
}

export const EVENTO_LLEGANDO: Record<TipoObjetivo, string> = { recogida: "llegando_recogida", destino: "llegando_destino" };
const ETIQUETAS: Record<string, string> = { llegando_recogida: "Llegando a la recogida", llegando_destino: "Llegando al destino",
  llegada_vuelo: "Llegada real del vuelo", recogida_reajustada: "Recogida reajustada por el vuelo",
  retraso_recogida: "Llega tarde a la recogida", deshecho: "Paso deshecho", devuelto: "Devuelto por el conductor", desasignado: "Quitado al conductor para reasignar",
  anomalia_carga: "CARGA lejos de la recogida", anomalia_descarga: "DESCARGA lejos del destino",
  aviso_cliente: "Aviso al cliente", editado: "Modificado por la central" };
export const etiquetaEvento = (tipo: string) => ETIQUETAS[tipo] ?? tipo;

/**
 * Evento «llegando_*» vigente para el servicio: el más reciente de los últimos 20 min, y solo si el estado actual
 * del servicio sigue correspondiendo (recogida ⇔ aceptado/en_camino; destino ⇔ recogido).
 */
export function llegandoReciente<E extends { servicio_id: string; tipo: string; creado_en: string }>(
  eventos: E[], s: { id: string; estado: EstadoServicio }, ahora: Date, ventanaMin = 20,
): E | null {
  // Los avisos al cliente (WhatsApp/SMS) no cambian la fase: no tapan el «Llegando».
  const ult = eventos.filter((e) => e.servicio_id === s.id && e.tipo !== "aviso_cliente").sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
  if (!ult || ahora.getTime() - new Date(ult.creado_en).getTime() > ventanaMin * 60_000) return null;
  if (ult.tipo === "llegando_recogida" && (s.estado === "aceptado" || s.estado === "en_camino")) return ult;
  if (ult.tipo === "llegando_destino" && s.estado === "recogido") return ult;
  return null;
}
export const EVENTO_RESALTAR = "tdl-resaltar-paso";
/** La navegación publica la distancia en línea recta al objetivo (null sin GPS) para confirmar CARGA/DESCARGA lejos. */
export const EVENTO_DISTANCIA = "tdl-distancia-objetivo";
export interface DetalleDistancia { servicioId: string; tipo: TipoObjetivo; distanciaM: number | null }

/** Recalcular ruta: si se desvía más de DESVIO_M de la polilínea, como mucho una vez cada REPETIR_RUTA_MS. */
export const DESVIO_M = 300, REPETIR_RUTA_MS = 30_000, REINTENTO_LLEGANDO_MS = 15_000;
export interface PeticionRuta { clave: string; t: number; conPos: boolean }
/** ¿Hay que pedir ruta? Objetivo nuevo, primer fix tras una ruta pedida sin posición, o desvío (limitado en el tiempo). */
export function debePedirRuta(prev: PeticionRuta | null, clave: string, conPos: boolean, desvioM: number | null, ahora: number): boolean {
  if (!prev || prev.clave !== clave) return true;
  if (!prev.conPos && conPos) return true;
  return desvioM != null && desvioM > DESVIO_M && ahora - prev.t >= REPETIR_RUTA_MS;
}
/** Tiempo restante proporcional a lo que queda de la ruta. */
export function tiempoRestanteS(ruta: { distanciaM: number; duracionS: number } | null, quedaM: number | null): number | null {
  if (!ruta || quedaM == null) return null;
  return ruta.distanciaM > 0 ? ruta.duracionS * Math.min(1, quedaM / ruta.distanciaM) : 0;
}
/** «Hacia la recogida · 4,2 km · 7 min» */
export function textoBannerRuta(tipo: TipoObjetivo, quedaM: number | null, quedaS: number | null): string {
  const t = tipo === "recogida" ? "Hacia la recogida" : "Hacia el destino";
  return `${t}${quedaM != null ? ` · ${formatoDistancia(quedaM)}` : ""}${quedaS != null ? ` · ${formatoDuracion(quedaS)}` : ""}`;
}
/** Texto del aviso de proximidad (banner y notificación local). */
export function textoAvisoProximidad(fase: Exclude<Fase, "lejos">, tipo: TipoObjetivo, distanciaM: number | null): string {
  const a = tipo === "recogida" ? "a la recogida" : "al destino";
  return fase === "llegado" ? `Has llegado ${a}` : `Estás llegando ${a}${distanciaM != null ? ` (≈ ${formatoDistancia(distanciaM)})` : ""}`;
}
/** Clave «una sola vez» por servicio + objetivo + aviso (cerca / llegado / central). */
export const claveAvisoNav = (servicioId: string, tipo: TipoObjetivo, aviso: "cerca" | "llegado" | "central") =>
  `tdl-nav:${servicioId}:${tipo}:${aviso}`;
