import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ipCliente } from "@/lib/ip";
import { permitir } from "@/lib/limite";
import { combinarSugerencias, lugarDesdeReverse, puntuarCoincidencia, type LugarSugerido } from "@/lib/dominio/geocodificacion";
import { crearBuscador, USER_AGENT } from "@/lib/geocodificacion/buscador";
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
      const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }); // sin temporizador: no fuga
      const { data, error } = await sb.from("lugares_frecuentes").select("nombre, lat, lng").limit(500);
      if (error) return [];
      frecuentesCache = { hasta: Date.now() + 600_000, datos: data ?? [] };
    }
    return frecuentesCache.datos.map((l) => ({ l, p: puntuarCoincidencia(l.nombre, q) })).filter((x) => x.p < 2)
      .sort((a, b) => a.p - b.p).slice(0, 5)
      .map(({ l }) => ({ etiqueta: l.nombre, lat: l.lat, lng: l.lng, frecuente: true, fuente: "frecuente" as const }));
  } catch { return []; }
}

const reversas = new Map<string, LugarSugerido>();
/** Dirección de unas coordenadas; si el servicio no responde, «Mi ubicación» con las coordenadas (sigue valiendo para recoger). */
async function direccionDe(lat: number, lng: number): Promise<LugarSugerido> {
  const k = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const enCache = reversas.get(k);
  if (enCache) return { ...enCache, lat, lng };
  const respaldo: LugarSugerido = { etiqueta: `Mi ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`, lat, lng, frecuente: false };
  // Misma cola de 1 petición/s que el buscador (antes, las peticiones simultáneas salían juntas y podían hacer que
  // Nominatim nos bloqueara, también para el buscador). Si la cola va larga, «Mi ubicación» con las coordenadas.
  if (!(await buscador.turnoNominatim())) return respaldo;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
      { headers: { "User-Agent": USER_AGENT, "Accept-Language": "es,ca,en" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const lugar = r.ok ? lugarDesdeReverse(await r.json(), lat, lng) : null;
    if (!lugar) return respaldo;
    if (reversas.size > 500) reversas.clear();
    reversas.set(k, lugar);
    return lugar;
  } catch {
    return respaldo;
  }
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

  // «Usar mi ubicación»: de las coordenadas del móvil a una dirección (Nominatim reverse, gratuito, 1 petición/s).
  if (params.has("lat") && params.has("lng")) {
    const lat = Number(params.get("lat")), lng = Number(params.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: "Coordenadas no válidas" }, { status: 400 });
    // Una persona pide su ubicación una o dos veces: más de 6/min por IP no pasan a Nominatim (sirven las coordenadas).
    if (!permitir(`geo-reversa:${ip}`, 6, 60_000)) return NextResponse.json({ etiqueta: `Mi ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`, lat, lng, frecuente: false });
    return NextResponse.json(await direccionDe(lat, lng));
  }

  const q = (params.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ error: "Falta el texto a buscar" }, { status: 400 });
  if (q.length < 3) return NextResponse.json([]);
  const [frecuentes, externos] = await Promise.all([frecuentesDe(q), buscador.buscar(q)]);
  return NextResponse.json(combinarSugerencias({ frecuentes, externos }));
}
