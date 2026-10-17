// Búsqueda externa de direcciones: Google Places (solo con clave) → Photon + Nominatim en paralelo, fusionados.
// Photon y Nominatim son servicios públicos gratuitos de OpenStreetMap: como mucho 1 petición por segundo a cada
// uno desde este proceso (se hace cola de hasta 2 s; si hay más, se salta), User-Agent propio, timeout de 8 s y
// caché de 24 h de cada respuesta válida (también las vacías; nunca los fallos). Una misma URL en curso no se pide dos veces.
// Velocidad: en cuanto un proveedor da resultados, el otro tiene 600 ms de cortesía; si no llega, se responde con lo
// que hay y su petición sigue en segundo plano y se guarda en caché (medido: Photon público tarda 6-7 s, Nominatim ~0,6 s).
import { fusionarResultados, parsearNominatim, parsearPhoton, type Candidato, type LugarSugerido } from "@/lib/dominio/geocodificacion";
import { analizarConsulta, cajaAlrededor, variantesConsulta, type LocalidadConocida } from "@/lib/dominio/consultaDireccion";
import type { crearGooglePlaces } from "./google";

export const USER_AGENT = "TransferdeLuxe-demo/1.0 (hackathon)";
const TTL = 24 * 3600_000;
const HUECO_MS = 1000;
const ESPERA_MAX_MS = 2000;
/** Timeout de cada petición a un proveedor (aunque ya se haya respondido sin ella: así su resultado queda en caché). */
const TIMEOUT_PETICION_MS = 8000;
/** Cortesía para el proveedor lento cuando el otro ya dio resultados. */
const GRACIA_MS = 600;
/** Sin localidad detectada, Nominatim se limita a Cataluña y alrededores (como antes). */
const VIEWBOX_REGION = "0.15,42.9,3.35,40.5";

type Google = ReturnType<typeof crearGooglePlaces>;
type Opciones = { fetch?: typeof fetch; ahora?: () => number; dormir?: (ms: number) => Promise<void>; google?: Google | null; graciaMs?: number };
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

/**
 * Espera a varias búsquedas en paralelo sin quedar a merced de la más lenta: termina cuando acaban todas, cuando
 * pasan `graciaMs` desde la primera que trae resultados, o a los `plazoMs`. Devuelve lo de cada una (null = no llegó a
 * tiempo; un fallo cuenta como []). Las que no llegan siguen su curso (no se cancelan).
 */
export function reunirConGracia<T>(promesas: Promise<T[]>[], { graciaMs, plazoMs }: { graciaMs: number; plazoMs: number }): Promise<(T[] | null)[]> {
  return new Promise((resolver) => {
    const res: (T[] | null)[] = promesas.map(() => null);
    let pendientes = promesas.length, hecho = false;
    let gracia: ReturnType<typeof setTimeout> | undefined;
    const terminar = () => {
      if (hecho) return;
      hecho = true; clearTimeout(gracia); clearTimeout(plazo);
      resolver([...res]);
    };
    const plazo = setTimeout(terminar, plazoMs);
    if (!pendientes) return terminar();
    promesas.forEach((p, i) => {
      p.then((v) => { res[i] = v; }, () => { res[i] = []; }).then(() => {
        if (--pendientes === 0) return terminar();
        if (res[i]?.length && gracia === undefined && !hecho) gracia = setTimeout(terminar, graciaMs);
      });
    });
  });
}

export function crearBuscador({ fetch: f = fetch, ahora = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), google = null, graciaMs = GRACIA_MS }: Opciones = {}) {
  const cache = new Map<string, { hasta: number; datos: Candidato[] }>();
  const enCurso = new Map<string, Promise<Candidato[] | null>>();
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
      const r = await f(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_PETICION_MS) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  function guardar(clave: string, datos: Candidato[]) {
    const t = ahora();
    if (cache.size > 500) for (const [k, v] of cache) if (v.hasta <= t) cache.delete(k);
    if (cache.size > 1000) cache.clear();
    cache.set(clave, { hasta: t + TTL, datos });
  }

  /** Una petición (de la caché si se puede; si ya está en curso, se espera a esa); null si falla o no hay turno. */
  async function pedir(p: Proveedor, url: string): Promise<Candidato[] | null> {
    const c = cache.get(url);
    if (c && c.hasta > ahora()) return c.datos;
    const pendiente = enCurso.get(url);
    if (pendiente) return pendiente;
    const nueva = (async () => {
      if (!(await turno(p))) return null;
      const datos = (p === "photon" ? parsearPhoton : parsearNominatim)(await pedirJson(url));
      if (datos) guardar(url, datos);
      return datos;
    })().finally(() => enCurso.delete(url));
    enCurso.set(url, nueva);
    return nueva;
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
    /** Turno de Nominatim para otras consultas (la dirección de «Usar mi ubicación»): la misma cola de 1 petición/s. */
    turnoNominatim: () => turno("nominatim"),
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
      const [photon, nominatim] = await reunirConGracia([
        porProveedor("photon", variantes, consulta.localidad), porProveedor("nominatim", variantes, consulta.localidad),
      ], { graciaMs, plazoMs: TIMEOUT_PETICION_MS + ESPERA_MAX_MS });
      return fusionarResultados([photon, nominatim], consulta);
    },
    /** Coordenadas de una sugerencia de Google (Place Details); null sin Google o si falla. */
    async detalle(placeId: string) {
      return google ? google.detalle(placeId) : null;
    },
    hayGoogle: () => google != null,
  };
}
