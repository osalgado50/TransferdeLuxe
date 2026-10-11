import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ipCliente } from "@/lib/ip";
import { permitir } from "@/lib/limite";

type Lugar = { etiqueta: string; lat: number; lng: number; frecuente: boolean };

const TTL = 24 * 3600_000;
const cache = new Map<string, { hasta: number; datos: Lugar[] }>(); // solo respuestas buenas de Nominatim
let ultimaLlamada = 0; // Nominatim público: como mucho 1 petición por segundo desde esta instancia

async function frecuentesDe(q: string): Promise<Lugar[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    // lugares_frecuentes es de lectura pública (política leer_lugares): basta la clave anon.
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await sb.from("lugares_frecuentes").select("nombre, lat, lng").ilike("nombre", `%${q.replace(/[%_\\]/g, "\\$&")}%`).limit(5);
    return (data ?? []).map((l) => ({ etiqueta: l.nombre, lat: l.lat, lng: l.lng, frecuente: true }));
  } catch { return []; }
}

async function nominatim(q: string): Promise<Lugar[] | null> {
  const clave = q.toLowerCase();
  const ahora = Date.now();
  const enCache = cache.get(clave);
  if (enCache && enCache.hasta > ahora) return enCache.datos;
  if (ahora - ultimaLlamada < 1000) return null; // sin hueco: solo resultados locales
  ultimaLlamada = ahora;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es&viewbox=0.15,42.9,3.35,40.5&bounded=1&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "TransferdeLuxe-demo/1.0 (hackathon)", "Accept-Language": "es" },
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const osm = (await r.json()) as { display_name: string; lat: string; lon: string }[];
    if (!Array.isArray(osm)) return null;
    const datos = osm.map((o) => ({ etiqueta: o.display_name, lat: Number(o.lat), lng: Number(o.lon), frecuente: false }));
    if (cache.size > 500) for (const [k, v] of cache) if (v.hasta <= ahora) cache.delete(k);
    if (cache.size > 1000) cache.clear();
    cache.set(clave, { hasta: ahora + TTL, datos });
    return datos;
  } catch { return null; }
}

export async function GET(req: Request) {
  const ip = ipCliente(req.headers);
  if (!permitir(`geo:${ip}`, 30, 60_000)) return NextResponse.json({ error: "Demasiadas peticiones. Espera un momento." }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ error: "Falta el texto a buscar" }, { status: 400 });
  if (q.length < 3) return NextResponse.json([]);
  const [frecuentes, osm] = await Promise.all([frecuentesDe(q), nominatim(q)]);
  return NextResponse.json([...frecuentes, ...(osm ?? [])]);
}
