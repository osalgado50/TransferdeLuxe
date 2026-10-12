import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { exigirModulo, subirFotoIncidencia } from "@/lib/conductor/modulos";
import { leerFotoDePeticion } from "@/lib/fotoPeticion";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-incidencia-foto:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const sb = clienteAdmin();
  const m = await exigirModulo(sb, "incidencias");
  if (!m.ok) return Response.json({ error: m.error }, { status: 403 });
  const f = await leerFotoDePeticion(req);
  if (!f.ok) return f.res;
  const r = await subirFotoIncidencia(sb, a.yo.id, f.foto);
  return r.ok ? Response.json({ fotoPath: r.fotoPath }) : Response.json({ error: r.error }, { status: r.status });
}
