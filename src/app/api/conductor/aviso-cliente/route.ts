import { z } from "zod";
import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { datosAviso, registrarAvisoCliente } from "@/lib/servicios/seguimiento";
import { TIPOS_AVISO } from "@/lib/dominio/avisoCliente";

export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const cuerpo = z.object({
  idAccion: z.string().uuid(), servicioId: z.string().uuid(),
  tipo: z.enum(TIPOS_AVISO as [string, ...string[]]), canal: z.enum(["whatsapp", "sms"]).default("whatsapp"),
});

/** Datos para redactar el aviso al cliente: enlace de seguimiento (/s/<token>), nombre de pila, modelo y matrícula. */
export async function GET(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-aviso-datos:${a.yo.id}`, 30, 60_000)) return demasiadas();
  const id = uuid.safeParse(new URL(req.url).searchParams.get("servicioId"));
  if (!id.success) return datosNoValidos();
  const r = await datosAviso(clienteAdmin(), { id: a.yo.id, rol: a.yo.rol, conduce: a.yo.conduce, central: false }, id.data);
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: r.status });
  return Response.json({ ok: true, ruta: r.ruta, conductor: r.conductor, modelo: r.modelo, matricula: r.matricula });
}

/** Tras abrir WhatsApp/SMS: anota el aviso (evento aviso_cliente) para la Actividad en vivo. Idempotente por idAccion. */
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-aviso:${a.yo.id}`, 20, 60_000)) return demasiadas();
  const b = cuerpo.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  const r = await registrarAvisoCliente(clienteAdmin(), { id: a.yo.id, rol: a.yo.rol, conduce: a.yo.conduce, central: false },
    { ...b.data, tipo: b.data.tipo as (typeof TIPOS_AVISO)[number] });
  return r.ok ? Response.json(r) : Response.json({ ok: false, error: r.error }, { status: r.status });
}
