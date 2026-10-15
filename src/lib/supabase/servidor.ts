import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchConTiempo } from "./admin";

/**
 * Cliente de Supabase con la sesión de las cookies (páginas y server actions). Usa `fetchConTiempo` (con `signal` y
 * 20 s de tope): sin él, cada GET pasaba por la deduplicación de `fetch` de Next, que clona la respuesta con `tee()` y la
 * dejaba retenida → fuga de ~140–460 KB por página renderizada de la central (medido: OOM a las ~1 200 páginas).
 */
export async function clienteServidor() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => { try { lista.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC */ } },
    },
    global: { fetch: fetchConTiempo },
  });
}
