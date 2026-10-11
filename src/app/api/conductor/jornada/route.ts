import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { accionJornada } from "@/lib/conductor/modulos";
import { ACCIONES_JORNADA, type AccionJornada } from "@/lib/dominio/jornada";

export const dynamic = "force-dynamic";

/** Jornada laboral desde la app nativa: { accion: iniciar|pausa|reanudar|finalizar }. */
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-jornada:${a.yo.id}`, 20, 60_000)) return demasiadas();
  const accion = ((await leerJson(req)) as { accion?: unknown } | null)?.accion;
  if (!ACCIONES_JORNADA.includes(accion as AccionJornada)) return datosNoValidos();
  const r = await accionJornada(clienteAdmin(), a.yo.id, accion as AccionJornada);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status ?? 400 });
}
