import { NextResponse } from "next/server";
import { puedeConducir } from "@/lib/dominio/tipos";
import { perfilActual } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";
import { detectarTipoImagen, extensionDe } from "@/lib/firmaImagen";

const MAX = 5 * 1024 * 1024;

// Solo valida y guarda la foto; la lectura (OCR) se hace en el navegador.
export async function POST(req: Request) {
  const yo = await perfilActual();
  if (!yo || !puedeConducir(yo)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!permitir(`web-ticket-foto:${yo.id}`, 10, 60_000)) return NextResponse.json({ error: "Demasiadas peticiones. Espera un momento." }, { status: 429 });
  const largo = Number(req.headers.get("content-length"));
  if (!largo) return NextResponse.json({ error: "Falta el tamaño de la petición" }, { status: 411 });
  if (largo > MAX + 1024 * 1024) return NextResponse.json({ error: "La foto pesa más de 5 MB" }, { status: 413 });
  let foto: FormDataEntryValue | null;
  try { foto = (await req.formData()).get("foto"); } catch { return NextResponse.json({ error: "Falta la foto" }, { status: 400 }); }
  if (!(foto instanceof File)) return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
  if (foto.size > MAX) return NextResponse.json({ error: "La foto pesa más de 5 MB" }, { status: 400 });
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const tipo = detectarTipoImagen(bytes);
  if (!tipo) return NextResponse.json({ error: "Formato no admitido" }, { status: 400 });
  const fotoPath = `${yo.id}/${crypto.randomUUID()}.${extensionDe(tipo)}`;
  const { error } = await clienteAdmin().storage.from("tickets").upload(fotoPath, Buffer.from(bytes), { contentType: tipo });
  if (error) return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 });
  return NextResponse.json({ fotoPath });
}
