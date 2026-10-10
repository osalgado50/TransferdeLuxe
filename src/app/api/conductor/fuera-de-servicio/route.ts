import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { marcarFueraDeServicio } from "@/lib/servicios/llegando";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-fuera:${a.yo.id}`, 20, 60_000)) return demasiadas();
  await marcarFueraDeServicio(clienteAdmin(), a.yo.id);
  return Response.json({ ok: true });
}
