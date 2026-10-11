import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";

export type EstadoBd = "ok" | "caida" | "desconocida";
const CADA_MS = 30_000;
const TOPE_MS = 3000;
let ultimo: { estado: EstadoBd; en: number } = { estado: "desconocida", en: 0 };
let enCurso: Promise<void> | null = null;

/** Solo para tests. */
export function reiniciarSalud() { ultimo = { estado: "desconocida", en: 0 }; enCurso = null; }

async function comprobar(sonda: () => PromiseLike<{ error: unknown }>) {
  let estado: EstadoBd = "caida";
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      Promise.resolve(sonda()),
      new Promise<{ error: unknown }>((ok) => { t = setTimeout(() => ok({ error: "tiempo" }), TOPE_MS); }),
    ]);
    estado = r.error ? "caida" : "ok";
  } catch { estado = "caida"; } finally { clearTimeout(t); }
  ultimo = { estado, en: Date.now() };
}

/**
 * Estado de la BD, cacheado 30 s para todo el proceso. Si hace falta refrescar, se lanza UNA comprobación
 * (`select id from ajustes limit 1`, tope 3 s) y se espera; las peticiones concurrentes comparten la misma.
 */
export async function estadoBd(sonda: () => PromiseLike<{ error: unknown }> = () => clienteAdmin().from("ajustes").select("id").limit(1)): Promise<{ estado: EstadoBd; haceS: number | null }> {
  if (Date.now() - ultimo.en >= CADA_MS) {
    enCurso ??= comprobar(sonda).finally(() => { enCurso = null; });
    await enCurso;
  }
  return { estado: ultimo.estado, haceS: ultimo.en ? Math.round((Date.now() - ultimo.en) / 1000) : null };
}
