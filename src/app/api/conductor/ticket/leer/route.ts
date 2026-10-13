import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { leerTicketServidor } from "@/lib/lector/ocrServidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lee un ticket ya subido (`fotoPath` de /api/conductor/ticket/foto) con OCR libre en el servidor y devuelve los datos
 * para rellenar el formulario de la app nativa. Solo propone: el conductor revisa y guarda.
 */
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-ticket-leer:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const b = (await leerJson(req)) as { fotoPath?: unknown } | null;
  const fotoPath = typeof b?.fotoPath === "string" ? b.fotoPath : "";
  // Solo sus propias fotos: «<su id>/<uuid>.<ext>».
  if (!new RegExp(`^${a.yo.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(fotoPath)) return datosNoValidos();
  const { data, error } = await clienteAdmin().storage.from("tickets").download(fotoPath);
  if (error || !data) return Response.json({ error: "No se encuentra la foto del ticket." }, { status: 404 });
  try {
    const datos = await leerTicketServidor(Buffer.from(await data.arrayBuffer()));
    return Response.json({ datos });
  } catch (e) {
    const detalle = e instanceof Error ? e.message.slice(-700) : "error";
    console.error("[ticket/leer]", detalle);
    // `detalle`: en qué fase falló (arranque / lectura), sin datos personales: ayuda a diagnosticar en producción.
    return Response.json({ error: "No se pudo leer el ticket. Rellena los datos a mano.", detalle }, { status: 503 });
  }
}
