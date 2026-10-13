import { distanciaKm } from "./geo";
import { formatoDistancia } from "./navegacion";
import { zonaCercana } from "./zonas";
import type { Punto } from "./tipos";

/**
 * CARGA / DESCARGA lejos del punto (lógica pura; la detección corre en el vigilante del servidor).
 * Al registrarse «recogido» (CARGA) o «completado» (DESCARGA) se compara la posición del conductor en ese momento con
 * el origen o el destino del servicio: si está a más del umbral (ajustes.umbral_anomalia_m), alerta a la central.
 * Sin coordenadas en el servicio o sin GPS del conductor: no se alerta (no se puede saber).
 */
export const UMBRAL_ANOMALIA_DEFECTO_M = 500;
/** Posiciones del conductor que valen para el evento: ±2 min. */
export const VENTANA_POSICION_MS = 2 * 60_000;
/** La posición actual vale si se registró como mucho 5 min antes o después del evento. */
export const VALIDEZ_POSICION_ACTUAL_MS = 5 * 60_000;

export type TipoAnomalia = "anomalia_carga" | "anomalia_descarga";
export const TIPOS_ANOMALIA: readonly TipoAnomalia[] = ["anomalia_carga", "anomalia_descarga"];
export const esAnomalia = (tipo: string): tipo is TipoAnomalia => (TIPOS_ANOMALIA as readonly string[]).includes(tipo);
export const EVENTO_A_ANOMALIA: Record<string, TipoAnomalia> = { recogido: "anomalia_carga", completado: "anomalia_descarga" };

export interface PosicionRegistrada { lat: number; lng: number; registrado_en: string }
export interface ServicioAnomalia {
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
  origen_texto: string; destino_texto: string;
}
export interface Anomalia { tipo: TipoAnomalia; distanciaM: number; lat: number; lng: number }

const valido = (p: { lat: unknown; lng: unknown } | null | undefined): p is Punto =>
  !!p && typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

/** Posición del conductor al registrar el evento: la de `posiciones` más cercana en el tiempo (±2 min) o la actual reciente. */
export function posicionEnEvento(posiciones: readonly PosicionRegistrada[], en: string, actual?: PosicionRegistrada | null,
  ventanaMs = VENTANA_POSICION_MS): Punto | null {
  const t = Date.parse(en);
  if (!Number.isFinite(t)) return null;
  let mejor: PosicionRegistrada | null = null, dt = Infinity;
  for (const p of posiciones) {
    const d = Math.abs(Date.parse(p.registrado_en) - t);
    if (valido(p) && d <= ventanaMs && d < dt) { mejor = p; dt = d; }
  }
  if (mejor) return { lat: mejor.lat, lng: mejor.lng };
  if (actual && valido(actual) && Math.abs(Date.parse(actual.registrado_en) - t) <= VALIDEZ_POSICION_ACTUAL_MS) return { lat: actual.lat, lng: actual.lng };
  return null;
}

/** Evalúa un evento «recogido»/«completado». null si no hay anomalía (o no se puede saber). */
export function evaluarAnomalia(tipoEvento: string, s: ServicioAnomalia, posicion: Punto | null, umbralM = UMBRAL_ANOMALIA_DEFECTO_M): Anomalia | null {
  const tipo = EVENTO_A_ANOMALIA[tipoEvento];
  if (!tipo || !valido(posicion)) return null;
  const objetivo = tipo === "anomalia_carga" ? { lat: s.origen_lat, lng: s.origen_lng } : { lat: s.destino_lat, lng: s.destino_lng };
  if (!valido(objetivo)) return null;
  const distanciaM = Math.round(distanciaKm(posicion, objetivo) * 1000);
  if (distanciaM <= Math.max(50, umbralM)) return null;
  return { tipo, distanciaM, lat: posicion.lat, lng: posicion.lng };
}

/** Motivo guardado en el evento: «d=2300;lat=41.07;lng=1.05». */
export const motivoAnomalia = (a: Pick<Anomalia, "distanciaM" | "lat" | "lng">) => `d=${Math.round(a.distanciaM)};lat=${a.lat.toFixed(5)};lng=${a.lng.toFixed(5)}`;
export function leerMotivoAnomalia(m: string | null | undefined): { distanciaM: number; lat: number; lng: number } | null {
  const x = /^d=(\d+);lat=(-?[\d.]+);lng=(-?[\d.]+)$/.exec((m ?? "").trim());
  if (!x) return null;
  const r = { distanciaM: Number(x[1]), lat: Number(x[2]), lng: Number(x[3]) };
  return Number.isFinite(r.lat) && Number.isFinite(r.lng) ? r : null;
}

/** «⚠️ Marc ha marcado CARGA a 2,3 km de la recogida (Salou – Plaza Europa) · está cerca de Cambrils». */
export function textoAnomalia(nombre: string, tipo: TipoAnomalia, distanciaM: number, lugar: string | null, pos?: Punto | null): string {
  const zona = pos ? zonaCercana(pos.lat, pos.lng)?.texto ?? null : null;
  const que = tipo === "anomalia_carga" ? "CARGA" : "DESCARGA";
  const donde = tipo === "anomalia_carga" ? "de la recogida" : "del destino";
  return `⚠️ ${nombre} ha marcado ${que} a ${formatoDistancia(distanciaM)} ${donde}${lugar ? ` (${lugar})` : ""}${zona ? ` · está ${zona}` : ""}`;
}
