import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { exigirModulo, subirFotoIncidencia } from "@/lib/conductor/modulos";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-incidencia-foto:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const largo = Number(req.headers.get("content-length"));
  if (!largo) return Response.json({ error: "Falta el tamaño de la petición" }, { status: 411 });
  if (largo > 6 * 1024 * 1024) return Response.json({ error: "La foto pesa más de 5 MB" }, { status: 413 });
  const sb = clienteAdmin();
  const m = await exigirModulo(sb, "incidencias");
  if (!m.ok) return Response.json({ error: m.error }, { status: 403 });
  let foto: FormDataEntryValue | null;
  try { foto = (await req.formData()).get("foto"); } catch { return Response.json({ error: "Falta la foto" }, { status: 400 }); }
  const r = await subirFotoIncidencia(sb, a.yo.id, foto);
  return r.ok ? Response.json({ fotoPath: r.fotoPath }) : Response.json({ error: r.error }, { status: r.status });
}
