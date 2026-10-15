import { z } from "zod";
import { datosNoValidos, demasiadas, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { ejecutarAccionOperador } from "@/lib/central/operaciones";

export const dynamic = "force-dynamic";

const ESTADOS = ["pendiente", "asignado", "aceptado", "en_camino", "recogido", "completado", "cancelado", "subcontratado"] as const;
// estadoEsperado (opcional, apps nuevas): el que veía el operador; si el conductor avanzó, no se deshace lo que no tocaba.
const cuerpo = z.object({ idAccion: z.string().uuid(), servicioId: z.string().uuid(), estadoEsperado: z.enum(ESTADOS).optional() });

/** POST /api/central/deshacer (modo central de la app): deshace el último paso del conductor, sin límite de tiempo. 409 = rechazo. */
export async function POST(req: Request) {
  const a = await exigirOperadorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`central-accion:${a.yo.id}`, 30, 60_000)) return demasiadas();
  const b = cuerpo.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  try {
    const { r } = await ejecutarAccionOperador(a.yo.id, { ...b.data, accion: "deshacer" });
    return Response.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    console.error("[central] deshacer", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "No se pudo completar ahora. Inténtalo de nuevo." }, { status: 503 });
  }
}
