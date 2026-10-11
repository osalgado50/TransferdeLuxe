import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { detectarTipoImagen, extensionDe } from "@/lib/firmaImagen";

export const dynamic = "force-dynamic";
const MAX = 5 * 1024 * 1024;

// Misma validación y ruta que /api/tickets/foto, con autenticación Bearer (app nativa).
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-ticket-foto:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const largo = Number(req.headers.get("content-length"));
  if (!largo) return Response.json({ error: "Falta el tamaño de la petición" }, { status: 411 });
  if (largo > MAX + 1024 * 1024) return Response.json({ error: "La foto pesa más de 5 MB" }, { status: 413 });
  let foto: FormDataEntryValue | null;
  try { foto = (await req.formData()).get("foto"); } catch { return Response.json({ error: "Falta la foto" }, { status: 400 }); }
  if (!(foto instanceof File)) return Response.json({ error: "Falta la foto" }, { status: 400 });
  if (foto.size > MAX) return Response.json({ error: "La foto pesa más de 5 MB" }, { status: 400 });
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const tipo = detectarTipoImagen(bytes);
  if (!tipo) return Response.json({ error: "Formato no admitido" }, { status: 400 });
  const fotoPath = `${a.yo.id}/${crypto.randomUUID()}.${extensionDe(tipo)}`;
  const { error } = await clienteAdmin().storage.from("tickets").upload(fotoPath, Buffer.from(bytes), { contentType: tipo });
  if (error) return Response.json({ error: "No se pudo guardar la foto" }, { status: 500 });
  return Response.json({ fotoPath });
}
