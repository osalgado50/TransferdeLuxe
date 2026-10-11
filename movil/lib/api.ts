import { API_URL } from "./config";
import { supabase } from "./supabase";

const TIEMPO_MAX_MS = 15_000; // sin respuesta en 15 s → error de red (antes podía quedarse «enviando» para siempre)

/** fetch con tiempo máximo (por defecto 15 s): al agotarse lanza como un error de red. */
export function fetchConTiempo(url: Parameters<typeof fetch>[0], init: RequestInit = {}, ms = TIEMPO_MAX_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/** Llamada a la API web con el JWT de la sesión (401 → refresca y reintenta una vez). Lanza solo por red o tiempo agotado. */
export async function llamarApi(ruta: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<Response> {
  const hacer = (token: string | null) => {
    // AbortController manual (AbortSignal.timeout no está garantizado en Hermes).
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init.form ? 45_000 : TIEMPO_MAX_MS);
    return fetch(`${API_URL}${ruta}`, {
    method: init.method ?? "GET",
    signal: ctrl.signal,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined && !init.form ? { "content-type": "application/json" } : {}) },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    }).finally(() => clearTimeout(t));
  };
  let r = await hacer((await supabase.auth.getSession()).data.session?.access_token ?? null);
  if (r.status === 401) {
    const t = (await supabase.auth.refreshSession()).data.session?.access_token ?? null;
    if (t) r = await hacer(t);
  }
  return r;
}
