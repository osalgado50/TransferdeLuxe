// Reintentos con freno (lógica pura, compartida por la web, la app nativa y el servidor).
// Incidente del 11/10/2026: un cliente que reintenta «en caliente» (sin espera) tumba el servidor y calienta el móvil.

export interface OpcionesBackoff { baseMs?: number; topeMs?: number; azar?: () => number }

/**
 * Espera antes del reintento nº `intentos` (1 = primer fallo): base·2^(n-1) con tope y «equal jitter»
 * (entre la mitad y el total), para que muchos clientes no reintenten a la vez y nunca en caliente.
 */
export function esperaBackoff(intentos: number, { baseMs = 2000, topeMs = 5 * 60_000, azar = Math.random }: OpcionesBackoff = {}): number {
  const n = Math.max(1, Math.floor(intentos));
  const d = Math.min(topeMs, baseMs * 2 ** Math.min(n - 1, 30));
  const r = Math.min(1, Math.max(0, azar()));
  return Math.round(d / 2 + r * (d / 2));
}

/** Segundos de una cabecera Retry-After (número o fecha HTTP). null si falta o no es válida. Tope 1 h. */
export function segundosRetryAfter(valor: string | null | undefined, ahora = Date.now()): number | null {
  if (!valor) return null;
  const v = valor.trim();
  if (/^\d+$/.test(v)) return Math.min(3600, Number(v));
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.min(3600, Math.max(0, Math.ceil((t - ahora) / 1000)));
}

export type SaludRespuesta = "ok" | "caido";

/**
 * ¿La respuesta indica que el servidor no está disponible para nosotros? Red/tiempo agotado (status 0),
 * 5xx, 429, o una página HTML donde se esperaba JSON (p. ej. el 403 «Checking your browser» de la CDN).
 * Un 4xx con JSON (401, 403 de negocio, 409…) significa que el servidor responde: «ok».
 */
export function clasificarRespuesta(status: number, contentType: string | null | undefined): SaludRespuesta {
  if (!status || status >= 500 || status === 429) return "caido";
  if (/text\/html/i.test(contentType ?? "") && (status >= 400 || status === 200)) return "caido";
  return "ok";
}

/**
 * Freno de una acción costosa (p. ej. router.refresh o recargar un resumen): como mucho una vez cada `minMs`.
 * Las peticiones dentro de la ventana se agrupan en UNA ejecución al final de la ventana (no se pierden).
 */
export function crearFreno(minMs: number, reloj: { ahora: () => number; programar: (f: () => void, ms: number) => unknown; cancelar: (t: unknown) => void } = {
  ahora: () => Date.now(), programar: (f, ms) => setTimeout(f, ms), cancelar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
}) {
  let ultima = -Infinity;
  let pendiente: unknown = null;
  let accion: (() => void) | null = null;
  const correr = () => { pendiente = null; ultima = reloj.ahora(); const f = accion; accion = null; f?.(); };
  return {
    pedir(f: () => void) {
      accion = f;
      if (pendiente !== null) return;
      const falta = ultima + minMs - reloj.ahora();
      if (falta <= 0) correr();
      else pendiente = reloj.programar(correr, falta);
    },
    cancelar() { if (pendiente !== null) reloj.cancelar(pendiente); pendiente = null; accion = null; },
  };
}
