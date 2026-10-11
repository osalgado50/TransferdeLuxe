import { z } from "zod";
import { datosNoValidos, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { resolverIncidenciaOperador } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

/** App nativa (modo central): «Resuelta» en una incidencia (p. ej. la tarjeta roja de una avería). */
export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  const b = z.object({ incidenciaId: z.string().uuid() }).safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  if (!(await resolverIncidenciaOperador(b.data.incidenciaId))) return Response.json({ error: "La incidencia no existe" }, { status: 404 });
  return Response.json({ ok: true });
}
