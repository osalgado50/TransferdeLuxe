// Búsqueda externa de direcciones: Google Places (solo con clave) → Photon → Nominatim de respaldo.
// Photon y Nominatim son servicios públicos gratuitos de OpenStreetMap: como mucho 1 petición por segundo
// a cada uno desde este proceso, User-Agent propio, timeout de 5 s y caché de 24 h solo de respuestas buenas.
import { parsearNominatim, parsearPhoton, type LugarSugerido } from "@/lib/dominio/geocodificacion";
import type { crearGooglePlaces } from "./google";

export const USER_AGENT = "TransferdeLuxe-demo/1.0 (hackathon)";
const TTL = 24 * 3600_000;
const HUECO_MS = 1000;

type Google = ReturnType<typeof crearGooglePlaces>;
type Opciones = { fetch?: typeof fetch; ahora?: () => number; google?: Google | null };

export function crearBuscador({ fetch: f = fetch, ahora = Date.now, google = null }: Opciones = {}) {
  const cache = new Map<string, { hasta: number; datos: LugarSugerido[] }>();
  const ultima: Record<string, number> = {};

  /** Reserva el hueco de 1 s del proveedor; false si se acaba de usar (entonces se salta). */
  function hueco(proveedor: string): boolean {
    const t = ahora();
    if (t - (ultima[proveedor] ?? -Infinity) < HUECO_MS) return false;
    ultima[proveedor] = t; return true;
  }

  async function pedirJson(url: string): Promise<unknown> {
    try {
      const r = await f(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  const proveedores: [string, (q: string) => Promise<LugarSugerido[] | null>][] = [
    ...(google ? [["google", (q: string) => google.autocompletar(q)] as [string, (q: string) => Promise<LugarSugerido[] | null>]] : []),
    ["photon", async (q) => parsearPhoton(await pedirJson(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=41.08&lon=1.14&limit=8&lang=default`))],
    ["nominatim", async (q) => parsearNominatim(await pedirJson(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es&viewbox=0.15,42.9,3.35,40.5&bounded=1&q=${encodeURIComponent(q)}`))],
  ];

  function guardar(clave: string, datos: LugarSugerido[]) {
    const t = ahora();
    if (cache.size > 500) for (const [k, v] of cache) if (v.hasta <= t) cache.delete(k);
    if (cache.size > 1000) cache.clear();
    cache.set(clave, { hasta: t + TTL, datos });
  }

  return {
    /** Sugerencias externas; [] si todos fallan o no hay hueco (la ruta sigue con los resultados locales). */
    async buscar(q: string): Promise<LugarSugerido[]> {
      const clave = q.trim().toLowerCase();
      const enCache = cache.get(clave);
      if (enCache && enCache.hasta > ahora()) return enCache.datos;
      for (const [nombre, buscar] of proveedores) {
        if (!hueco(nombre)) continue;
        const datos = await buscar(q);
        // Una lista vacía de Photon puede ser un nombre mal escrito: se prueba Nominatim antes de rendirse.
        if (datos && (datos.length || nombre === "nominatim")) { guardar(clave, datos); return datos; }
      }
      return [];
    },
    /** Coordenadas de una sugerencia de Google (Place Details); null sin Google o si falla. */
    async detalle(placeId: string) {
      return google ? google.detalle(placeId) : null;
    },
    hayGoogle: () => google != null,
  };
}
