import "server-only";
import { z } from "zod";
import { after } from "next/server";
import { datosNoValidos, demasiadas, exigirOperadorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { ejecutarAccionOperador } from "@/lib/central/operaciones";

const cuerpo = z.object({
  idAccion: z.string().uuid(), servicioId: z.string().uuid(), conductorId: z.string().uuid(),
  vehiculoId: z.string().uuid().nullish(),
  // Estado que veía el operador en la app: con el servicio en marcha, el servidor lo exige (apps antiguas: se rechaza).
  estadoEsperado: z.enum(["pendiente", "asignado", "aceptado", "en_camino", "recogido"]).optional(),
});

/** POST /api/central/asignar y /reasignar (app nativa en modo central). 200 ok, 409 rechazo de negocio. */
export function rutaAsignar(accion: "asignar" | "reasignar") {
  return async function POST(req: Request) {
    const a = await exigirOperadorBearer(req);
    if (!a.ok) return a.res;
    if (!permitir(`central-accion:${a.yo.id}`, 30, 60_000)) return demasiadas();
    const b = cuerpo.safeParse(await leerJson(req));
    if (!b.success) return datosNoValidos();
    try {
      const { r, avisar } = await ejecutarAccionOperador(a.yo.id, { ...b.data, vehiculoId: b.data.vehiculoId ?? undefined, accion });
      after(avisar);
      return Response.json(r, { status: r.ok ? 200 : 409 });
    } catch (e) {
      console.error(`[central] ${accion}`, e instanceof Error ? e.message : e);
      return Response.json({ ok: false, error: "No se pudo completar ahora. Inténtalo de nuevo." }, { status: 503 });
    }
  };
}
