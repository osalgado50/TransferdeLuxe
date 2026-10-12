import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { registrarCierre } from "@/lib/conductor/modulos";

export const dynamic = "force-dynamic";

/**
 * Hoja de cierre de jornada desde la app nativa: { idAccion, vehiculo_id, zonas[], tecnico{}, combustible, km?, comentario? }.
 * Guarda el cierre y FINALIZA la jornada abierta (atómico). Idempotente por idAccion y por jornada.
 */
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-cierre:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const r = await registrarCierre(clienteAdmin(), a.yo.id, await leerJson(req));
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status ?? 400 });
}
