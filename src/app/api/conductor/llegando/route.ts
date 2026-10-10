import { z } from "zod";
import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { registrarLlegando } from "@/lib/servicios/llegando";

export const dynamic = "force-dynamic";
const cuerpo = z.object({ servicioId: z.string().uuid(), objetivo: z.enum(["recogida", "destino"]) });

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-llegando:${a.yo.id}`, 20, 60_000)) return demasiadas();
  const b = cuerpo.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  const r = await registrarLlegando(clienteAdmin(), a.yo.id, b.data.servicioId, b.data.objetivo);
  return r.ok ? Response.json(r) : Response.json({ ok: false, error: "No se puede avisar de la llegada en este servicio." }, { status: 409 });
}
