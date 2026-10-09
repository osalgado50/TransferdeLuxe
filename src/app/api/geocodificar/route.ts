import { NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ipCliente } from "@/lib/ip";
import { permitir } from "@/lib/limite";

type Lugar = { etiqueta: string; lat: number; lng: number; frecuente: boolean };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json([]);
  const ip = ipCliente(req.headers);
  let frecuentes: Lugar[] = [];
  try {
    const { data: lugares } = await clienteAdmin().from("lugares_frecuentes").select("nombre, lat, lng").ilike("nombre", `%${q}%`).limit(5);
    frecuentes = (lugares ?? []).map((l) => ({ etiqueta: l.nombre, lat: l.lat, lng: l.lng, frecuente: true }));
  } catch { /* sin Supabase configurado: solo Nominatim */ }
  if (!permitir(`geo:${ip}`, 30, 60_000)) return NextResponse.json(frecuentes);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es&viewbox=0.15,42.9,3.35,40.5&bounded=1&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "TransferdeLuxe-demo/1.0 (hackathon)", "Accept-Language": "es" }, next: { revalidate: 86400 } });
    const osm = (await r.json()) as { display_name: string; lat: string; lon: string }[];
    return NextResponse.json([...frecuentes, ...osm.map((o) => ({ etiqueta: o.display_name, lat: Number(o.lat), lng: Number(o.lon), frecuente: false }))]);
  } catch { return NextResponse.json(frecuentes); }
}
