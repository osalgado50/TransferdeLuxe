// Búsqueda de direcciones: formato de etiquetas y orden de las sugerencias (lógica pura, sin red).

export type FuenteLugar = "empresa" | "favorito" | "frecuente" | "photon" | "nominatim" | "google";

/** Lo que devuelve /api/geocodificar (los campos `frecuente` y `etiqueta` se mantienen por las apps antiguas). */
export type LugarSugerido = {
  etiqueta: string; lat: number | null; lng: number | null; frecuente: boolean;
  fuente?: FuenteLugar;
  /** Solo Google: las coordenadas se piden aparte (Place Details) al elegir la sugerencia. */
  placeId?: string;
  /** Nombre corto (lugar de la empresa o favorito) para mostrarlo delante. */
  nombre?: string;
};

/** Minúsculas, sin acentos ni espacios repetidos: «Logística» y «logistica» casan. */
export const normalizarBusqueda = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** 0 = empieza por lo buscado (o alguna palabra empieza), 1 = lo contiene, 2 = no casa. */
export function puntuarCoincidencia(texto: string, q: string): 0 | 1 | 2 {
  const t = normalizarBusqueda(texto), b = normalizarBusqueda(q);
  if (!b) return 2;
  if (t.startsWith(b) || t.includes(` ${b}`)) return 0;
  return t.includes(b) ? 1 : 2;
}

// Países que se aceptan de Photon: España y Andorra (destino habitual de traslados).
const PAISES = new Set(["ES", "AD"]);

type PropsPhoton = {
  name?: string; street?: string; housenumber?: string; city?: string; town?: string; village?: string;
  locality?: string; district?: string; county?: string; state?: string; countrycode?: string; type?: string;
};

/** «Nombre · Calle nº · Localidad» (el nombre del lugar primero si lo hay; sin partes repetidas). */
export function etiquetaPhoton(p: PropsPhoton): string {
  const calle = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : "";
  const localidad = p.city ?? p.town ?? p.village ?? "";
  const partes = [p.name ?? "", calle, localidad].map((s) => s.trim()).filter(Boolean);
  // Una población o región suelta («Salou»): se añade la comarca/provincia para distinguirla.
  if (partes.length < 2) partes.push((p.county ?? p.state ?? "").trim());
  const vistas = new Set<string>();
  return partes.filter((s) => {
    const k = normalizarBusqueda(s);
    if (!k || vistas.has(k)) return false;
    vistas.add(k); return true;
  }).join(" · ");
}

/** Convierte la respuesta GeoJSON de Photon; null si no tiene la forma esperada. */
export function parsearPhoton(json: unknown): LugarSugerido[] | null {
  const f = (json as { features?: unknown })?.features;
  if (!Array.isArray(f)) return null;
  const lugares: LugarSugerido[] = [];
  for (const x of f as { geometry?: { coordinates?: unknown }; properties?: PropsPhoton }[]) {
    const c = x?.geometry?.coordinates, p = x?.properties ?? {};
    if (!Array.isArray(c) || !Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) continue;
    if (p.countrycode && !PAISES.has(p.countrycode.toUpperCase())) continue;
    const etiqueta = etiquetaPhoton(p);
    if (!etiqueta) continue;
    lugares.push({ etiqueta, lat: Number(c[1]), lng: Number(c[0]), frecuente: false, fuente: "photon" });
  }
  return quitarRepetidos(lugares);
}

/** Convierte la respuesta de Nominatim (format=jsonv2); null si no tiene la forma esperada. */
export function parsearNominatim(json: unknown): LugarSugerido[] | null {
  if (!Array.isArray(json)) return null;
  return (json as { display_name?: string; lat?: string; lon?: string }[])
    .filter((o) => o?.display_name && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)))
    .map((o) => ({ etiqueta: o.display_name!, lat: Number(o.lat), lng: Number(o.lon), frecuente: false, fuente: "nominatim" as const }));
}

/** Quita sugerencias con la misma etiqueta (sin acentos ni mayúsculas); se queda con la primera. */
export function quitarRepetidos<T extends { etiqueta: string }>(lista: T[]): T[] {
  const vistas = new Set<string>();
  return lista.filter((l) => {
    const k = normalizarBusqueda(l.etiqueta);
    if (vistas.has(k)) return false;
    vistas.add(k); return true;
  });
}

/** Orden de las sugerencias: empresa 🏢 → favoritos ⭐ → frecuentes 📍 → búsqueda externa. */
export function combinarSugerencias(grupos: { empresa?: LugarSugerido[]; favoritos?: LugarSugerido[]; frecuentes?: LugarSugerido[]; externos?: LugarSugerido[] }) {
  return quitarRepetidos([...(grupos.empresa ?? []), ...(grupos.favoritos ?? []), ...(grupos.frecuentes ?? []), ...(grupos.externos ?? [])]);
}

/** Texto con el que se rellena el campo al elegir un lugar con nombre: «Nombre · dirección» (sin repetir el nombre). */
export function textoConNombre(nombre: string, direccion: string): string {
  const n = nombre.trim(), d = direccion.trim();
  if (!d) return n;
  return normalizarBusqueda(d).startsWith(normalizarBusqueda(n)) ? d : `${n} · ${d}`;
}

/** Atribución que se muestra bajo el desplegable según de dónde vengan las sugerencias externas. */
export function atribucion(lugares: { fuente?: FuenteLugar }[]): string | null {
  if (lugares.some((l) => l.fuente === "google")) return "Búsqueda: Google";
  if (lugares.some((l) => l.fuente === "photon")) return "Búsqueda: Photon / © OpenStreetMap";
  if (lugares.some((l) => l.fuente === "nominatim")) return "Búsqueda: © OpenStreetMap";
  return null;
}
