import { segundosRetryAfter } from "@/lib/dominio/reintento";

/** Cliente de POST /api/conductor/accion con Bearer (app nativa). Lógica pura: fetch y sesión se inyectan. */
export type AccionApp = "aceptar" | "rechazar" | "salir" | "cargar" | "descargar";
export interface PeticionAccion { idAccion: string; servicioId: string; accion: AccionApp; motivo?: string }
export type RespuestaAccion = { ok: true; estado?: string; duplicada?: boolean } | { ok: false; error: string };

export interface DepsAccion {
  apiUrl: string;
  token: () => Promise<string | null>;
  /** Refresca la sesión y devuelve el token nuevo (o null si no se pudo). */
  refrescar: () => Promise<string | null>;
  fetch: typeof fetch;
}

/** Fallo transitorio (red, sesión, 429, 5xx, HTML de un proxy): la acción debe conservarse para reintentarla. */
export class ErrorTransitorio extends Error {
  /** Espera mínima pedida por el servidor (Retry-After), en ms. La cola la respeta además de su backoff. */
  constructor(mensaje: string, public reintentarEnMs?: number) { super(mensaje); }
}

/**
 * Devuelve {ok:true} o {ok:false,error} (rechazo de negocio: no reintentar).
 * Lanza ErrorTransitorio si hay que reintentar más tarde. 401 → refresca la sesión y reintenta una vez.
 */
export function crearEnviarAccion(d: DepsAccion) {
  const url = `${d.apiUrl.replace(/\/+$/, "")}/api/conductor/accion`;
  const llamar = async (token: string | null, p: PeticionAccion) => {
    if (!token) throw new ErrorTransitorio("Sin sesión");
    try {
      return await d.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(p),
      });
    } catch {
      throw new ErrorTransitorio("Sin conexión");
    }
  };
  return async (p: PeticionAccion): Promise<RespuestaAccion> => {
    let res = await llamar(await d.token(), p);
    if (res.status === 401) res = await llamar(await d.refrescar(), p);
    if (res.status === 401) throw new ErrorTransitorio("Sesión caducada");
    if (res.status === 429 || res.status >= 500) {
      const s = segundosRetryAfter(res.headers?.get?.("retry-after"));
      throw new ErrorTransitorio(`HTTP ${res.status}`, s == null ? undefined : s * 1000);
    }
    let json: unknown;
    try { json = await res.json(); } catch { throw new ErrorTransitorio("Respuesta no válida"); }
    const j = (json ?? {}) as { ok?: unknown; error?: unknown; estado?: unknown; duplicada?: unknown };
    if (res.ok && j.ok === true) {
      return { ok: true, estado: typeof j.estado === "string" ? j.estado : undefined, duplicada: j.duplicada === true || undefined };
    }
    if (res.ok) throw new ErrorTransitorio("Respuesta no válida"); // 2xx inesperado (p. ej. HTML de un proxy)
    return { ok: false, error: typeof j.error === "string" ? j.error : "No se pudo completar la acción" };
  };
}
