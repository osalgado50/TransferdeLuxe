import { z } from "zod";
import { datosNoValidos, demasiadas, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { ejecutarAccionOperador } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

const cuerpo = z.object({ idAccion: z.string().uuid(), servicioId: z.string().uuid() });

/** POST /api/central/deshacer (modo central de la app): deshace el último paso del conductor, sin límite de tiempo. 409 = rechazo. */
export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`central-accion:${a.yo.id}`, 30, 60_000)) return demasiadas();
  const b = cuerpo.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  const { r } = await ejecutarAccionOperador(a.yo.id, { ...b.data, accion: "deshacer" });
  return Response.json(r, { status: r.ok ? 200 : 409 });
}
