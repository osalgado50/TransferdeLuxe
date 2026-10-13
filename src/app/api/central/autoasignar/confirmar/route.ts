import { after } from "next/server";
import { datosNoValidos, demasiadas, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { confirmarPropuesta, esquemaConfirmar } from "@/lib/central/autoasignar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/central/autoasignar/confirmar (central, Bearer). Cuerpo: { lote, margenMinimo?, lineas: [{ servicioId, conductorId, forzar? }] }.
 * Revalida en el servidor y asigna cada línea (idempotente por lote + servicio); push a cada conductor. 200 con contadores.
 */
export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`autoasignar:${a.yo.id}`, 20, 60_000)) return demasiadas();
  const b = esquemaConfirmar.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  const { r, avisar } = await confirmarPropuesta(a.yo.id, b.data);
  after(avisar);
  return Response.json(r);
}
