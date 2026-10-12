import { z } from "zod";
import { datosNoValidos, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { marcarCierreVisto } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

/** App nativa (modo central): «Visto» en una hoja de cierre (deja de ser alerta pendiente para toda la central). */
export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  const b = z.object({ cierreId: z.string().uuid() }).safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  if (!(await marcarCierreVisto(b.data.cierreId))) return Response.json({ error: "La hoja de cierre no existe" }, { status: 404 });
  return Response.json({ ok: true });
}
