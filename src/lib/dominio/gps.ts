// Decisiones puras del gestor de GPS (sin navegador): testeables en unit tests.

export const CADA_MS = 15_000;          // envío a la central cada 15 s
export const SIN_FIX_MS = 30_000;       // sin fix 30 s → reiniciar watchPosition
export const ENVIO_TIMEOUT_MS = 10_000; // un insert colgado no puede bloquear los siguientes
export const AVISO_MS = 60_000;         // aviso rojo si la última posición enviada es más vieja
export const REINTENTO_MS = 5_000;      // tras un error, como mucho un intento cada 5 s
export const REFRESCO_MS = 30_000;      // como mucho un refreshSession cada 30 s
export const REARRANQUE_MIN_MS = 2_000; // visibilitychange + pageshow seguidos → un solo reinicio

/** ¿Se debe enviar este fix? `pendienteDesde` = inicio del envío en vuelo (null si no hay). */
export function debeEnviar(ahora: number, ultimoEnvio: number, pendienteDesde: number | null, ultimoIntento = 0): boolean {
  if (pendienteDesde !== null && ahora - pendienteDesde < ENVIO_TIMEOUT_MS) return false;
  if (ultimoIntento > ultimoEnvio && ahora - ultimoIntento < REINTENTO_MS) return false; // falló: esperar
  return ahora - ultimoEnvio >= CADA_MS;
}

/** ¿El watch está muerto? Cuenta desde el último fix o, si no hubo ninguno, desde que se arrancó. */
export function debeReiniciar(ahora: number, ultimoFix: number | null, arrancado: number): boolean {
  return ahora - Math.max(ultimoFix ?? 0, arrancado) >= SIN_FIX_MS;
}

/** Texto y gravedad del indicador «última posición enviada». */
export function estadoEnvio(ahora: number, ultimo: number | null, enServicioDesde: number | null = null): { texto: string; alerta: boolean } {
  if (ultimo === null) {
    const tarde = enServicioDesde !== null && ahora - enServicioDesde > AVISO_MS;
    return { texto: tarde ? "📍 sin enviar posición todavía" : "📍 esperando GPS…", alerta: tarde };
  }
  const s = Math.max(0, Math.round((ahora - ultimo) / 1000));
  return { texto: `📍 última posición enviada hace ${s}s`, alerta: ahora - ultimo > AVISO_MS };
}
