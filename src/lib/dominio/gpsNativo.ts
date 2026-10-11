// Decisiones puras del GPS en segundo plano de la app nativa (TVL Conductor). Sin dependencias de Expo:
// las prueba vitest en la raíz y las importa la app vía @dominio/gpsNativo.

export const MIN_ENTRE_ENVIOS_MS = 12_000; // el SO puede entregar lotes seguidos: como mucho un envío cada 12 s
export const COLA_GPS_MAX = 200;           // posiciones pendientes guardadas sin red (se descartan las más viejas)
export const MARGEN_REFRESCO_S = 60;       // refrescar el token si caduca en menos de 60 s

export interface PosicionPendiente { dueno: string; lat: number; lng: number; velocidad: number | null; precision_m: number | null; ts: number }

/** ¿Toca enviar? `ultimoEnvio` = ms del último envío correcto (o null si nunca). */
export function debeEnviarNativo(ahora: number, ultimoEnvio: number | null): boolean {
  return ultimoEnvio === null || ahora - ultimoEnvio >= MIN_ENTRE_ENVIOS_MS;
}

/** Añade a la cola respetando el tope: se tiran las más antiguas. */
export function encolarPosicion(cola: PosicionPendiente[], p: PosicionPendiente, max = COLA_GPS_MAX): PosicionPendiente[] {
  const nueva = [...cola, p];
  return nueva.length > max ? nueva.slice(nueva.length - max) : nueva;
}

/** Qué hacer con la sesión antes de insertar. `expiraEn` = expires_at de Supabase (segundos epoch). */
export function decisionSesion(haySesion: boolean, expiraEn: number | undefined, ahoraMs: number): "sin_sesion" | "refrescar" | "ok" {
  if (!haySesion) return "sin_sesion";
  if (expiraEn === undefined) return "ok";
  return expiraEn - ahoraMs / 1000 < MARGEN_REFRESCO_S ? "refrescar" : "ok";
}

/** Velocidad de expo-location en m/s (igual que la web); -1/null = desconocida. */
export function velocidadValida(v: number | null | undefined): number | null {
  return v == null || v < 0 ? null : v;
}

/** Fila para `posiciones`; `registrado_en` = hora real del fix (nunca en el futuro) para que la cola no pise la posición actual. */
export function filaPosicion(conductorId: string, p: PosicionPendiente, ahora: number) {
  return { conductor_id: conductorId, lat: p.lat, lng: p.lng, velocidad: p.velocidad, precision_m: p.precision_m,
    registrado_en: new Date(Math.min(p.ts, ahora)).toISOString() };
}

// ---- Selección de puntos de un lote (todos los fixes, no solo el último) + modo ahorro con el coche parado ----
export const PARADO_CADA_MS = 60_000; // parado: un punto por minuto (latido; la central marca «sin señal» a los 5 min)
export const PARADO_VEL_MS = 1;       // < 1 m/s ≈ 3,6 km/h
export const PARADO_RADIO_M = 30;     // y a menos de 30 m del último punto aceptado

export interface Fix { lat: number; lng: number; velocidad: number | null; precision_m: number | null; ts: number }
export interface Referencia { lat: number; lng: number; ts: number }

function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** ¿Está parado respecto al último punto aceptado? (velocidad baja o desconocida y casi sin moverse) */
export function estaParado(f: Fix, ref: Referencia | null): boolean {
  if (!ref) return false;
  return (f.velocidad === null || f.velocidad < PARADO_VEL_MS) && distanciaM(f, ref) < PARADO_RADIO_M;
}

/**
 * De un lote de fixes, los que se guardan: en orden, posteriores a la referencia, separados ≥ 12 s
 * (≥ 60 s si el coche está parado). Devuelve también la nueva referencia.
 */
export function seleccionarPuntos(fixes: Fix[], ref: Referencia | null): { puntos: Fix[]; ref: Referencia | null } {
  const puntos: Fix[] = [];
  let r = ref;
  for (const f of [...fixes].sort((a, b) => a.ts - b.ts)) {
    if (r && f.ts <= r.ts) continue;
    const hueco = r ? f.ts - r.ts : Infinity;
    if (hueco < (estaParado(f, r) ? PARADO_CADA_MS : MIN_ENTRE_ENVIOS_MS)) continue;
    puntos.push(f);
    r = { lat: f.lat, lng: f.lng, ts: f.ts };
  }
  return { puntos, ref: r };
}

export const TROZO_ENVIO = 50; // filas por insert al vaciar la cola

// Claves de AsyncStorage, todas por conductor. `on` guarda una «generación» (cambia en cada encendido; ausente = OFF).
export const PREFIJO_GPS = "tvl:gps:";
export const claveOn = (id: string) => `${PREFIJO_GPS}on:${id}`;
export const claveCola = (id: string) => `${PREFIJO_GPS}cola:${id}`;
export const claveUltimo = (id: string) => `${PREFIJO_GPS}ultimo:${id}`;
export const claveRef = (id: string) => `${PREFIJO_GPS}ref:${id}`;

/** Solo las filas del conductor de la sesión actual. */
export const filtrarCola = (cola: PosicionPendiente[], dueno: string) => cola.filter((p) => p.dueno === dueno);

export function trozos<T>(xs: T[], n = TROZO_ENVIO): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

export type EstadoSesionGps = "ok" | "sin_sesion" | "reintentar";

/**
 * Resultado de refreshSession. Solo se da la sesión por perdida si el servidor rechaza el refresh token
 * (AuthApiError 400/401) o no hay sesión sin error; un fallo de red / reintentable conserva la sesión (zona sin cobertura).
 */
export function clasificarRefresco(haySesion: boolean, error: { name?: string; status?: number } | null | undefined): EstadoSesionGps {
  if (haySesion) return "ok";
  if (!error) return "sin_sesion";
  if (error.name === "AuthApiError" && (error.status === 400 || error.status === 401)) return "sin_sesion";
  return "reintentar";
}

/** ¿Sigue encendido con la misma generación con la que empezó este lote? (OFF durante el envío → descartar). */
export const sigueActivo = (inicio: string | null, actual: string | null) => inicio !== null && inicio === actual;

/** Qué hace la tarea con un lote. */
export function decidirLote(activo: boolean, sesion: EstadoSesionGps): "descartar" | "parar_y_limpiar" | "encolar" | "enviar" {
  if (sesion === "sin_sesion") return "parar_y_limpiar";
  if (!activo) return "descartar";
  return sesion === "ok" ? "enviar" : "encolar";
}

// ---- Interruptor «En servicio» ----
export type EstadoInterruptor = "fuera" | "en_servicio" | "solo_primer_plano";
export type Permiso = "granted" | "denied" | "undetermined";

/** Resultado de encender según los permisos obtenidos. */
export function alEncender(primerPlano: Permiso, fondo: Permiso): { estado: EstadoInterruptor; error?: string } {
  if (primerPlano !== "granted") return { estado: "fuera", error: "Sin permiso de ubicación no se puede entrar en servicio. Actívalo en Ajustes." };
  return { estado: fondo === "granted" ? "en_servicio" : "solo_primer_plano" };
}

/** Al abrir la app: qué hacer con el estado persistido. */
export function alIniciar(persistidoOn: boolean, tareaCorriendo: boolean, primerPlano: Permiso, fondo: Permiso):
  { accion: "nada" | "arrancar" | "parar"; estado: EstadoInterruptor } {
  if (!persistidoOn) return { accion: tareaCorriendo ? "parar" : "nada", estado: "fuera" };
  if (primerPlano !== "granted") return { accion: tareaCorriendo ? "parar" : "nada", estado: "fuera" };
  const estado: EstadoInterruptor = fondo === "granted" ? "en_servicio" : "solo_primer_plano";
  return { accion: tareaCorriendo ? "nada" : "arrancar", estado };
}

export const AVISO_SIN_FONDO = "Con la pantalla bloqueada no se enviará la ubicación";
