import { z } from "zod";
import { datosNoValidos, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { marcarAlertaVista } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  const b = z.object({ servicioId: z.string().uuid() }).safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  await marcarAlertaVista(b.data.servicioId);
  return Response.json({ ok: true });
}
