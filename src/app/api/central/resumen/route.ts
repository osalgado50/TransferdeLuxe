import { exigirOperadorBearer } from "@/lib/supabase/bearer";
import { resumenCentral } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  return Response.json(await resumenCentral());
}
