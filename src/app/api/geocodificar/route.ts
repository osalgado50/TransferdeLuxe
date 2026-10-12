import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ipCliente } from "@/lib/ip";
import { permitir } from "@/lib/limite";
import { combinarSugerencias, puntuarCoincidencia, type LugarSugerido } from "@/lib/dominio/geocodificacion";
import { crearBuscador } from "@/lib/geocodificacion/buscador";
import { googleDesdeEntorno, placeIdValido } from "@/lib/geocodificacion/google";

// Ruta pública (la usan /reservar, la central y las apps antiguas): solo lugares frecuentes + búsqueda externa.
// Los lugares de la empresa y los favoritos NO salen de aquí: la central los filtra en el navegador.
const buscador = crearBuscador({ google: googleDesdeEntorno() });

let frecuentesCache: { hasta: number; datos: { nombre: string; lat: number; lng: number }[] } | null = null;

async function frecuentesDe(q: string): Promise<LugarSugerido[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    // Son pocos (tabla de lectura pública): se traen todos cada 10 min y se filtran sin acentos ni mayúsculas.
    if (!frecuentesCache || frecuentesCache.hasta < Date.now()) {
      const sb = createClient(url, anon, { auth: { persistSession: false } });
      const { data, error } = await sb.from("lugares_frecuentes").select("nombre, lat, lng").limit(500);
      if (error) return [];
      frecuentesCache = { hasta: Date.now() + 600_000, datos: data ?? [] };
    }
    return frecuentesCache.datos.map((l) => ({ l, p: puntuarCoincidencia(l.nombre, q) })).filter((x) => x.p < 2)
      .sort((a, b) => a.p - b.p).slice(0, 5)
      .map(({ l }) => ({ etiqueta: l.nombre, lat: l.lat, lng: l.lng, frecuente: true, fuente: "frecuente" as const }));
  } catch { return []; }
}

export async function GET(req: Request) {
  const ip = ipCliente(req.headers);
  if (!permitir(`geo:${ip}`, 30, 60_000)) return NextResponse.json({ error: "Demasiadas peticiones. Espera un momento." }, { status: 429 });
  const params = new URL(req.url).searchParams;

  // Coordenadas de una sugerencia de Google (solo existe con GOOGLE_PLACES_API_KEY).
  const lugar = params.get("lugar");
  if (lugar != null) {
    if (!buscador.hayGoogle() || !placeIdValido(lugar)) return NextResponse.json({ error: "Lugar no válido" }, { status: 404 });
    const d = await buscador.detalle(lugar);
    return d ? NextResponse.json(d) : NextResponse.json({ error: "No se pudo localizar el lugar" }, { status: 502 });
  }

  const q = (params.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ error: "Falta el texto a buscar" }, { status: 400 });
  if (q.length < 3) return NextResponse.json([]);
  const [frecuentes, externos] = await Promise.all([frecuentesDe(q), buscador.buscar(q)]);
  return NextResponse.json(combinarSugerencias({ frecuentes, externos }));
}
