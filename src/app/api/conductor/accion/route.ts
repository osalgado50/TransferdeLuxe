import { z } from "zod";
import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  idAccion: z.string().uuid(),
  servicioId: z.string().uuid(),
  accion: z.enum(["aceptar", "rechazar", "salir", "cargar", "descargar"]),
  motivo: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-accion:${a.yo.id}`, 30, 60_000)) return demasiadas();
  const b = cuerpo.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...b.data, actor: { id: a.yo.id, rol: "conductor" } });
  return Response.json(r, { status: r.ok ? 200 : 409 });
}
