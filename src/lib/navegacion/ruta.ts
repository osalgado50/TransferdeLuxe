import { distanciaKm } from "@/lib/dominio/geo";
import { permitir } from "@/lib/limite";
import type { Punto } from "@/lib/dominio/tipos";

export interface Ruta { coords: [number, number][]; distanciaM: number; duracionS: number; fuente: "osrm" | "recta" }

export const CAJA = { latMin: 40.3, latMax: 43.0, lngMin: 0.0, lngMax: 3.5 }; // Cataluña aprox.
export function leerPunto(v: string | null): Punto | null {
  if (!v) return null;
  const [a, b, ...resto] = v.split(",");
  if (resto.length || !a?.trim() || !b?.trim()) return null;
  const lat = Number(a), lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
export const enCaja = (p: Punto) => p.lat >= CAJA.latMin && p.lat <= CAJA.latMax && p.lng >= CAJA.lngMin && p.lng <= CAJA.lngMax;

export function rutaRecta(o: Punto, d: Punto): Ruta {
  const distanciaM = Math.round(distanciaKm(o, d) * 1000 * 1.3);
  return { coords: [[o.lat, o.lng], [d.lat, d.lng]], distanciaM, duracionS: Math.round((distanciaM / 1000 / 50) * 3600), fuente: "recta" };
}

const TTL = 10 * 60_000, TTL_FALLO = 60_000;
const cache = new Map<string, { t: number; r: Ruta }>();
const enVuelo = new Map<string, Promise<Ruta>>();
let ultimaLlamada = 0; // servidor público de OSRM: como mucho 1 petición por segundo desde esta instancia
export const claveRuta = (o: Punto, d: Punto) => [o.lat, o.lng, d.lat, d.lng].map((x) => x.toFixed(3)).join(",");
export function limpiarCacheRuta() { cache.clear(); enVuelo.clear(); ultimaLlamada = 0; }

/** Ruta OSRM ya en la caché de esta instancia (sin pedir nada); null si no está o caducó. */
export function rutaEnCache(o: Punto, d: Punto): Ruta | null {
  const c = cache.get(claveRuta(o, d));
  return c && c.r.fuente === "osrm" && Date.now() - c.t < TTL ? c.r : null;
}

export async function obtenerRuta(o: Punto, d: Punto, f: typeof fetch = fetch): Promise<Ruta> {
  const k = claveRuta(o, d);
  const c = cache.get(k);
  if (c && Date.now() - c.t < (c.r.fuente === "osrm" ? TTL : TTL_FALLO)) return c.r;
  const vuelo = enVuelo.get(k);
  if (vuelo) return vuelo;
  if (!enCaja(o) || !enCaja(d)) return rutaRecta(o, d);
  const ahora = Date.now();
  if (ahora - ultimaLlamada < 1000 || !permitir("ruta:global", 50, 60_000)) return rutaRecta(o, d);
  ultimaLlamada = ahora;
  const p = pedirOsrm(o, d, f).then((r) => {
    if (cache.size > 500) cache.clear();
    cache.set(k, { t: Date.now(), r }); // los fallos también se guardan (60 s) para no insistir
    return r;
  }).finally(() => enVuelo.delete(k));
  enVuelo.set(k, p);
  return p;
}

async function pedirOsrm(o: Punto, d: Punto, f: typeof fetch): Promise<Ruta> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
    const r = await f(url, { headers: { "User-Agent": "TransferdeLuxe-demo/1.0 (hackathon; navegacion conductor)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) throw new Error(`OSRM ${r.status}`);
    const j = (await r.json()) as { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const ruta = j.routes?.[0];
    if (j.code !== "Ok" || !ruta || ruta.geometry.coordinates.length < 2) throw new Error("OSRM sin ruta");
    return { coords: ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]), distanciaM: Math.round(ruta.distance), duracionS: Math.round(ruta.duration), fuente: "osrm" };
  } catch {
    return rutaRecta(o, d);
  }
}
