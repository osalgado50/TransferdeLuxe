import { z } from "zod";
import { datosNoValidos, exigirOperadorBearer } from "@/lib/supabase/bearer";
import { sugerenciasServicio } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("servicio"));
  if (!id.success) return datosNoValidos();
  const sugerencias = await sugerenciasServicio(id.data);
  if (!sugerencias) return Response.json({ error: "Servicio no encontrado" }, { status: 404 });
  return Response.json({ sugerencias });
}
