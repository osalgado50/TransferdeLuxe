import { NextResponse } from "next/server";
import { perfilActual } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";

const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

// Solo valida y guarda la foto; la lectura (OCR) se hace en el navegador.
export async function POST(req: Request) {
  const yo = await perfilActual();
  if (!yo || yo.rol !== "conductor") return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const foto = (await req.formData()).get("foto");
  if (!(foto instanceof File)) return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
  if (foto.size > 5 * 1024 * 1024) return NextResponse.json({ error: "La foto pesa más de 5 MB" }, { status: 400 });
  if (!TIPOS.includes(foto.type as (typeof TIPOS)[number])) return NextResponse.json({ error: "Formato no admitido" }, { status: 400 });
  const ext = foto.type.split("/")[1];
  const fotoPath = `${yo.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await clienteAdmin().storage.from("tickets").upload(fotoPath, Buffer.from(await foto.arrayBuffer()), { contentType: foto.type });
  if (error) return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 });
  return NextResponse.json({ fotoPath });
}
