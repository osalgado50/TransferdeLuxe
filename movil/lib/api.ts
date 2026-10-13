import { API_URL } from "./config";
import { fetchConTiempo, TIEMPO_MAX_MS } from "./red";
import { supabase } from "./supabase";

export { fetchConTiempo };

/** Llamada a la API web con el JWT de la sesión (401 → refresca y reintenta una vez). Lanza solo por red o tiempo agotado. */
/** `tiempoMs`: para llamadas lentas a propósito (lectura del ticket con OCR en el servidor). */
export async function llamarApi(ruta: string, init: { method?: string; body?: unknown; form?: FormData; tiempoMs?: number } = {}): Promise<Response> {
  const hacer = (token: string | null) => fetchConTiempo(`${API_URL}${ruta}`, {
    method: init.method ?? "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined && !init.form ? { "content-type": "application/json" } : {}) },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  }, init.tiempoMs ?? (init.form ? 45_000 : TIEMPO_MAX_MS));
  let r = await hacer((await supabase.auth.getSession()).data.session?.access_token ?? null);
  if (r.status === 401) {
    const t = (await supabase.auth.refreshSession()).data.session?.access_token ?? null;
    if (t) r = await hacer(t);
  }
  return r;
}
