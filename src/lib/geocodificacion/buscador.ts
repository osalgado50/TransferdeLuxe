// Búsqueda externa de direcciones: Google Places (solo con clave) → Photon + Nominatim en paralelo, fusionados.
// Photon y Nominatim son servicios públicos gratuitos de OpenStreetMap: como mucho 1 petición por segundo a cada
// uno desde este proceso (se hace cola de hasta 2 s; si hay más, se salta), User-Agent propio, timeout de 5 s y
// caché de 24 h de cada respuesta válida (también las vacías; nunca los fallos).
import { fusionarResultados, parsearNominatim, parsearPhoton, type Candidato, type LugarSugerido } from "@/lib/dominio/geocodificacion";
import { analizarConsulta, cajaAlrededor, variantesConsulta, type LocalidadConocida } from "@/lib/dominio/consultaDireccion";
import type { crearGooglePlaces } from "./google";

export const USER_AGENT = "TransferdeLuxe-demo/1.0 (hackathon)";
const TTL = 24 * 3600_000;
const HUECO_MS = 1000;
const ESPERA_MAX_MS = 2000;
/** Sin localidad detectada, Nominatim se limita a Cataluña y alrededores (como antes). */
const VIEWBOX_REGION = "0.15,42.9,3.35,40.5";

type Google = ReturnType<typeof crearGooglePlaces>;
type Opciones = { fetch?: typeof fetch; ahora?: () => number; dormir?: (ms: number) => Promise<void>; google?: Google | null };
type Proveedor = "photon" | "nominatim";

/** URL de cada proveedor: con localidad detectada, caja de ~8 km a su alrededor (Nominatim, estricta). */
export function urlProveedor(p: Proveedor, q: string, loc: LocalidadConocida | null): string {
  const e = encodeURIComponent(q);
  if (p === "photon") {
    const base = `https://photon.komoot.io/api/?q=${e}&lat=${loc?.lat ?? 41.08}&lon=${loc?.lng ?? 1.14}&limit=8&lang=default`;
    return loc ? `${base}&bbox=${cajaAlrededor(loc.lat, loc.lng, loc.radioKm).join(",")}` : base;
  }
  const [o, s, es, n] = loc ? cajaAlrededor(loc.lat, loc.lng, loc.radioKm) : [];
  const viewbox = loc ? `${o},${n},${es},${s}` : VIEWBOX_REGION;
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=es&viewbox=${viewbox}&bounded=1&q=${e}`;
}

export function crearBuscador({ fetch: f = fetch, ahora = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), google = null }: Opciones = {}) {
  const cache = new Map<string, { hasta: number; datos: Candidato[] }>();
  const cacheGoogle = new Map<string, { hasta: number; datos: LugarSugerido[] }>();
  const proximo: Record<string, number> = {};

  /** Turno del proveedor (1 petición/s): espera hasta 2 s; false si la cola es más larga (entonces se salta). */
  async function turno(p: string): Promise<boolean> {
    const t = ahora(), inicio = Math.max(t, proximo[p] ?? -Infinity);
    if (inicio - t > ESPERA_MAX_MS) return false;
    proximo[p] = inicio + HUECO_MS;
    if (inicio > t) await dormir(inicio - t);
    return true;
  }

  async function pedirJson(url: string): Promise<unknown> {
    try {
      const r = await f(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  function guardar(clave: string, datos: Candidato[]) {
    const t = ahora();
    if (cache.size > 500) for (const [k, v] of cache) if (v.hasta <= t) cache.delete(k);
    if (cache.size > 1000) cache.clear();
    cache.set(clave, { hasta: t + TTL, datos });
  }

  /** Una petición (de la caché si se puede); null si falla o no hay turno. */
  async function pedir(p: Proveedor, url: string): Promise<Candidato[] | null> {
    const c = cache.get(url);
    if (c && c.hasta > ahora()) return c.datos;
    if (!(await turno(p))) return null;
    const datos = (p === "photon" ? parsearPhoton : parsearNominatim)(await pedirJson(url));
    if (datos) guardar(url, datos);
    return datos;
  }

  /** Prueba las variantes en orden hasta que una dé resultados (la de respaldo: la calle sin número). */
  async function porProveedor(p: Proveedor, variantes: string[], loc: LocalidadConocida | null): Promise<Candidato[]> {
    for (const v of variantes) {
      const r = await pedir(p, urlProveedor(p, v, loc));
      if (r == null) return [];
      if (r.length) return r;
    }
    return [];
  }

  return {
    /** Sugerencias externas; [] si todos fallan o no hay turno (la ruta sigue con los resultados locales). */
    async buscar(q: string): Promise<LugarSugerido[]> {
      if (google) {
        const clave = `google:${q.trim().toLowerCase()}`, c = cacheGoogle.get(clave);
        if (c && c.hasta > ahora()) return c.datos;
        const g = (await turno("google")) ? await google.autocompletar(q) : null;
        if (g?.length) { if (cacheGoogle.size > 1000) cacheGoogle.clear(); cacheGoogle.set(clave, { hasta: ahora() + TTL, datos: g }); return g; }
      }
      const consulta = analizarConsulta(q);
      const variantes = variantesConsulta(consulta);
      const [photon, nominatim] = await Promise.all([
        porProveedor("photon", variantes, consulta.localidad), porProveedor("nominatim", variantes, consulta.localidad),
      ]);
      return fusionarResultados([photon, nominatim], consulta);
    },
    /** Coordenadas de una sugerencia de Google (Place Details); null sin Google o si falla. */
    async detalle(placeId: string) {
      return google ? google.detalle(placeId) : null;
    },
    hayGoogle: () => google != null,
  };
}
