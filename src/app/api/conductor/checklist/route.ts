import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { guardarRevision } from "@/lib/conductor/modulos";

export const dynamic = "force-dynamic";

/** Checklist diario: { vehiculo_id, respuestas: {item_id: ok|mal}, observaciones }. */
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-checklist:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const r = await guardarRevision(clienteAdmin(), a.yo.id, await leerJson(req));
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status ?? 400 });
}
