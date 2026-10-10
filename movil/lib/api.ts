import { API_URL } from "./config";
import { supabase } from "./supabase";

/** Llamada a la API web con el JWT de la sesión (401 → refresca y reintenta una vez). Lanza solo por red. */
export async function llamarApi(ruta: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const hacer = (token: string | null) => fetch(`${API_URL}${ruta}`, {
    method: init.method ?? "GET",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let r = await hacer((await supabase.auth.getSession()).data.session?.access_token ?? null);
  if (r.status === 401) {
    const t = (await supabase.auth.refreshSession()).data.session?.access_token ?? null;
    if (t) r = await hacer(t);
  }
  return r;
}
