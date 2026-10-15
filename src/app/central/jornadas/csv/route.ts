import { perfilActual } from "@/lib/supabase/sesion";
import { jornadasEnRango, modulosCentral, rangoDias } from "@/lib/central/modulosConductor";
import { csvRegistro, registroPorDia } from "@/lib/dominio/jornada";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const yo = await perfilActual();
  if (yo?.rol !== "operador") return new Response("No autorizado", { status: 401 });
  if (!(await modulosCentral()).jornada) return new Response("Módulo desactivado", { status: 404 });
  const u = new URL(req.url);
  const { desde, hasta } = rangoDias({ desde: u.searchParams.get("desde") ?? undefined, hasta: u.searchParams.get("hasta") ?? undefined });
  let datos: Awaited<ReturnType<typeof jornadasEnRango>>;
  try {
    datos = await jornadasEnRango(desde, hasta);
  } catch {
    return new Response("No se pudo generar el registro horario. Inténtalo de nuevo.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const { jornadas, nombre } = datos;
  return new Response(csvRegistro(registroPorDia(jornadas, new Date()), nombre), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="registro-horario_${desde}_${hasta}.csv"` },
  });
}
