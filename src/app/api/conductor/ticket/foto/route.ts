import { clienteAdmin } from "@/lib/supabase/admin";
import { demasiadas, exigirConductorBearer } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";
import { detectarTipoImagen, extensionDe } from "@/lib/firmaImagen";
import { leerFotoDePeticion } from "@/lib/fotoPeticion";

export const dynamic = "force-dynamic";
const MAX = 5 * 1024 * 1024;

// Misma validación y ruta que /api/tickets/foto, con autenticación Bearer (app nativa).
export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-ticket-foto:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const f = await leerFotoDePeticion(req);
  if (!f.ok) return f.res;
  const foto = f.foto;
  if (foto.size > MAX) return Response.json({ error: "La foto pesa más de 5 MB" }, { status: 400 });
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const tipo = detectarTipoImagen(bytes);
  if (!tipo) return Response.json({ error: "Formato no admitido" }, { status: 400 });
  const fotoPath = `${a.yo.id}/${crypto.randomUUID()}.${extensionDe(tipo)}`;
  const { error } = await clienteAdmin().storage.from("tickets").upload(fotoPath, Buffer.from(bytes), { contentType: tipo });
  if (error) return Response.json({ error: "No se pudo guardar la foto" }, { status: 500 });
  return Response.json({ fotoPath });
}
