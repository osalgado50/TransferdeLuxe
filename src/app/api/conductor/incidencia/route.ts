import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { registrarIncidencia } from "@/lib/conductor/modulos";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-incidencia:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const r = await registrarIncidencia(clienteAdmin(), a.yo.id, await leerJson(req));
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status ?? 400 });
}
