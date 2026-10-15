import "server-only";
import { createClient } from "@supabase/supabase-js";

const TIEMPO_MAX_MS = 20_000;

/** fetch con tiempo máximo (respeta la señal del llamador): una consulta colgada no puede bloquear el proceso único. */
export const fetchConTiempo: typeof fetch = (url, init = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("Tiempo agotado con Supabase")), TIEMPO_MAX_MS);
  const externa = init.signal;
  const propagar = () => ctrl.abort(externa?.reason);
  if (externa) { if (externa.aborted) propagar(); else externa.addEventListener("abort", propagar, { once: true }); }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => { clearTimeout(t); externa?.removeEventListener("abort", propagar); });
};

/**
 * Cliente con la clave de servicio (solo servidor). `autoRefreshToken: false` es imprescindible: por defecto, fuera del
 * navegador, auth-js arranca un temporizador de refresco de sesión que nunca se para; como se crea un cliente por
 * petición (y por cada pasada del vigilante), cada uno dejaba su temporizador vivo reteniendo el cliente y la petición
 * entera → fuga de memoria (medida: OOM a las ~1 200 páginas con 512 MB).
 */
export function clienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchConTiempo },
  });
}
