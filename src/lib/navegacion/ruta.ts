import { distanciaKm } from "@/lib/dominio/geo";
import type { Punto } from "@/lib/dominio/tipos";

export interface Ruta { coords: [number, number][]; distanciaM: number; duracionS: number; fuente: "osrm" | "recta" }

export const CAJA = { latMin: 40.3, latMax: 43.0, lngMin: 0.0, lngMax: 3.5 }; // Cataluña aprox.
export function leerPunto(v: string | null): Punto | null {
  if (!v) return null;
  const [a, b, ...resto] = v.split(",");
  if (resto.length || a === undefined || b === undefined) return null;
  const lat = Number(a), lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < CAJA.latMin || lat > CAJA.latMax || lng < CAJA.lngMin || lng > CAJA.lngMax) return null;
  return { lat, lng };
}

export function rutaRecta(o: Punto, d: Punto): Ruta {
  const distanciaM = Math.round(distanciaKm(o, d) * 1000 * 1.3);
  return { coords: [[o.lat, o.lng], [d.lat, d.lng]], distanciaM, duracionS: Math.round((distanciaM / 1000 / 50) * 3600), fuente: "recta" };
}

const TTL = 10 * 60_000;
const cache = new Map<string, { t: number; r: Ruta }>();
export const claveRuta = (o: Punto, d: Punto) => [o.lat, o.lng, d.lat, d.lng].map((x) => x.toFixed(3)).join(",");
export function limpiarCacheRuta() { cache.clear(); }

export async function obtenerRuta(o: Punto, d: Punto, f: typeof fetch = fetch): Promise<Ruta> {
  const k = claveRuta(o, d);
  const c = cache.get(k);
  if (c && Date.now() - c.t < TTL) return c.r;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
    const r = await f(url, { headers: { "User-Agent": "TransferdeLuxe-demo/1.0 (hackathon; navegacion conductor)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) throw new Error(`OSRM ${r.status}`);
    const j = (await r.json()) as { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const ruta = j.routes?.[0];
    if (j.code !== "Ok" || !ruta || ruta.geometry.coordinates.length < 2) throw new Error("OSRM sin ruta");
    const res: Ruta = { coords: ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]), distanciaM: Math.round(ruta.distance), duracionS: Math.round(ruta.duration), fuente: "osrm" };
    if (cache.size > 500) cache.clear();
    cache.set(k, { t: Date.now(), r: res });
    return res;
  } catch {
    return rutaRecta(o, d);
  }
}
