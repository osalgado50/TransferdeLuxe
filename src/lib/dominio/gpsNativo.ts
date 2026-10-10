// Decisiones puras del GPS en segundo plano de la app nativa (TVL Conductor). Sin dependencias de Expo:
// las prueba vitest en la raíz y las importa la app vía @dominio/gpsNativo.

export const MIN_ENTRE_ENVIOS_MS = 12_000; // el SO puede entregar lotes seguidos: como mucho un envío cada 12 s
export const COLA_GPS_MAX = 200;           // posiciones pendientes guardadas sin red (se descartan las más viejas)
export const MARGEN_REFRESCO_S = 60;       // refrescar el token si caduca en menos de 60 s

export interface PosicionPendiente { lat: number; lng: number; velocidad: number | null; precision_m: number | null; ts: number }

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
