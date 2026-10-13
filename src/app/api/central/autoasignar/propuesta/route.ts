import { datosNoValidos, demasiadas, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { calcularPropuesta, datosAutoasignar, esquemaPropuesta } from "@/lib/central/autoasignar";

export const dynamic = "force-dynamic";

/**
 * POST /api/central/autoasignar/propuesta (central, Bearer). Cuerpo: { dia?, servicioIds?, conductorIds?, estrategia?, margenMinimo? }.
 * Devuelve la propuesta (no asigna nada) con la entrada usada, para poder reevaluar cambios a mano en el cliente.
 * GET ?dia=YYYY-MM-DD → datos del diálogo (pendientes del día y conductores).
 */
export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`autoasignar:${a.yo.id}`, 20, 60_000)) return demasiadas();
  const b = esquemaPropuesta.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  return Response.json(await calcularPropuesta(b.data));
}

export async function GET(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  const dia = new URL(req.url).searchParams.get("dia") ?? undefined;
  if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return datosNoValidos();
  return Response.json(await datosAutoasignar(dia));
}
