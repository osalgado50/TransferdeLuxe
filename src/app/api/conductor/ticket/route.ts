import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { guardarTicketConductor } from "@/lib/servicios/tickets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-ticket:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const cuerpo = await leerJson(req);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return datosNoValidos();
  const b = cuerpo as Record<string, unknown>;
  // datos_ia llega como objeto desde la app; el esquema web lo espera serializado.
  const entrada = { ...b, datos_ia: b.datos_ia && typeof b.datos_ia === "object" ? JSON.stringify(b.datos_ia) : b.datos_ia };
  const r = await guardarTicketConductor(clienteAdmin(), a.yo, entrada);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "No se pudo guardar el ticket" ? 500 : 400 });
  return Response.json({ ok: true });
}
