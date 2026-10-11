import { NextResponse } from "next/server";
import { perfilActual } from "@/lib/supabase/sesion";
import { permitir } from "@/lib/limite";
import { respuestaVerificacion, verificarBearer } from "@/lib/supabase/bearer";
import { leerPunto, obtenerRuta, rutaRecta } from "@/lib/navegacion/ruta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let yo;
  if (req.headers.get("authorization")) {
    const v = await verificarBearer(req);
    if (v.tipo === "limite" || v.tipo === "caido") return respuestaVerificacion(v); // 429/503 con Retry-After
    yo = v.tipo === "ok" ? v.perfil : null;
  } else yo = await perfilActual().catch(() => null);
  if (!yo || (yo.rol !== "conductor" && yo.rol !== "operador")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const o = leerPunto(sp.get("o")), d = leerPunto(sp.get("d"));
  if (!o || !d) return NextResponse.json({ error: "Coordenadas no válidas" }, { status: 400 });
  if (!permitir(`ruta:${yo.id}`, 30, 60_000)) return NextResponse.json(rutaRecta(o, d));
  return NextResponse.json(await obtenerRuta(o, d));
}
