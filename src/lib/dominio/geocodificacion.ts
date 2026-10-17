// Búsqueda de direcciones: formato de etiquetas y orden de las sugerencias (lógica pura, sin red).
import { distanciaKm } from "./geo";
import { esTipoVia, type ConsultaAnalizada, type LocalidadConocida } from "./consultaDireccion";

export type FuenteLugar = "empresa" | "favorito" | "frecuente" | "photon" | "nominatim" | "google";

/** Lo que devuelve /api/geocodificar (los campos `frecuente` y `etiqueta` se mantienen por las apps antiguas). */
export type LugarSugerido = {
  etiqueta: string; lat: number | null; lng: number | null; frecuente: boolean;
  fuente?: FuenteLugar;
  /** Solo Google: las coordenadas se piden aparte (Place Details) al elegir la sugerencia. */
  placeId?: string;
  /** Nombre corto (lugar de la empresa o favorito) para mostrarlo delante. */
  nombre?: string;
  /** El número de portal tecleado no está en el mapa: coordenadas de la calle (la etiqueta conserva el número). */
  aproximado?: boolean;
};

/** Qué es cada resultado externo: dirección con número > calle > establecimiento/lugar > población. */
export type TipoLugar = "direccion" | "calle" | "poi" | "localidad";

/** Resultado externo antes de fusionar: con sus partes para deduplicar, ordenar y marcar el número aproximado. */
export type Candidato = LugarSugerido & { lat: number; lng: number; tipo: TipoLugar; calle?: string; numero?: string; localidad?: string };

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
  locality?: string; district?: string; county?: string; state?: string; countrycode?: string; type?: string; osm_key?: string; osm_value?: string;
};

/** Paradas y andenes: ruido para un traslado (Photon devuelve «marquesina … Hotel X» al buscar el hotel). */
const PARADAS = new Set(["bus_stop", "platform", "stop_position", "stop"]);

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

const TIPOS_LOCALIDAD = new Set(["city", "town", "village", "hamlet", "locality", "district", "suburb", "neighbourhood", "quarter", "county", "state", "country", "municipality"]);

/** Convierte la respuesta GeoJSON de Photon; null si no tiene la forma esperada. */
export function parsearPhoton(json: unknown): Candidato[] | null {
  const f = (json as { features?: unknown })?.features;
  if (!Array.isArray(f)) return null;
  const lugares: Candidato[] = [];
  for (const x of f as { geometry?: { coordinates?: unknown }; properties?: PropsPhoton }[]) {
    const c = x?.geometry?.coordinates, p = x?.properties ?? {};
    if (!Array.isArray(c) || !Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) continue;
    if (p.countrycode && !PAISES.has(p.countrycode.toUpperCase())) continue;
    if (PARADAS.has(p.osm_value ?? "")) continue;
    const etiqueta = etiquetaPhoton(p);
    if (!etiqueta) continue;
    const tipo: TipoLugar = p.type === "street" ? "calle" : TIPOS_LOCALIDAD.has(p.type ?? "") ? "localidad"
      : p.name ? "poi" : p.housenumber ? "direccion" : "poi";
    lugares.push({
      etiqueta, lat: Number(c[1]), lng: Number(c[0]), frecuente: false, fuente: "photon", tipo,
      calle: tipo === "calle" ? p.name : p.street, numero: p.housenumber, localidad: p.city ?? p.town ?? p.village,
    });
  }
  return quitarRepetidos(lugares);
}

type ObjNominatim = {
  display_name?: string; lat?: string; lon?: string; name?: string; addresstype?: string; type?: string;
  address?: { road?: string; pedestrian?: string; house_number?: string; city?: string; town?: string; village?: string; municipality?: string; county?: string; state?: string };
};

/** Convierte la respuesta de Nominatim (format=jsonv2, mejor con addressdetails=1); null si no tiene la forma esperada. */
export function parsearNominatim(json: unknown): Candidato[] | null {
  if (!Array.isArray(json)) return null;
  const lugares: Candidato[] = [];
  for (const o of json as ObjNominatim[]) {
    if (!o?.display_name || !Number.isFinite(Number(o.lat)) || !Number.isFinite(Number(o.lon)) || PARADAS.has(o.type ?? "")) continue;
    const a = o.address, at = o.addresstype ?? "";
    const calle = a?.road ?? a?.pedestrian, localidad = a?.city ?? a?.town ?? a?.village ?? a?.municipality;
    const tipo: TipoLugar = at === "road" ? "calle" : TIPOS_LOCALIDAD.has(at) ? "localidad" : o.name ? "poi" : a?.house_number ? "direccion" : "poi";
    // Sin detalle de dirección (respuestas antiguas): la etiqueta larga de Nominatim tal cual.
    const etiqueta = a ? etiquetaPhoton({ name: o.name || undefined, street: calle, housenumber: a.house_number, city: localidad, county: a.county, state: a.state }) : o.display_name;
    lugares.push({ etiqueta: etiqueta || o.display_name, lat: Number(o.lat), lng: Number(o.lon), frecuente: false, fuente: "nominatim", tipo, calle, numero: a?.house_number, localidad });
  }
  return lugares;
}

/** Costa Dorada (Salou): las sugerencias más cercanas, primero. */
export const CENTRO_COSTA_DORADA = { lat: 41.07, lng: 1.14 };
const ORDEN_TIPO: Record<TipoLugar, number> = { direccion: 0, calle: 1, poi: 2, localidad: 3 };
/** Sin número tecleado se busca más bien un sitio: «aeropuerto reus» → el aeropuerto antes que su carretera de acceso. */
const ORDEN_TIPO_SIN_NUMERO: Record<TipoLugar, number> = { direccion: 0, poi: 1, calle: 2, localidad: 3 };
const ANILLOS_KM = [10, 30, 60];

/** ¿El resultado es de la localidad detectada (por nombre de municipio o a menos de 3 km de su centro)? */
export function deLaLocalidad(c: { lat: number; lng: number; localidad?: string }, l: LocalidadConocida): boolean {
  if (c.localidad && l.municipios.includes(normalizarBusqueda(c.localidad))) return true;
  return distanciaKm(c, l) <= 3;
}

/** Cuántas palabras de lo buscado (≥ 3 letras, sin contar «Carrer», «Avinguda»…) no empiezan ninguna palabra de la etiqueta. */
export function palabrasQueFaltan(etiqueta: string, buscado: string): number {
  const e = normalizarBusqueda(etiqueta).split(/[^a-z0-9·]+/).filter(Boolean);
  return normalizarBusqueda(buscado).split(/[^a-z0-9·]+/).filter((w) => w.length >= 3 && !esTipoVia(w) && !e.some((x) => x.startsWith(w))).length;
}

/**
 * Fusiona Photon + Nominatim: marca el número aproximado (calle sin el portal tecleado), quita repetidos
 * (misma calle + número + localidad, o a menos de 30 m y del mismo tipo) y ordena: localidad detectada >
 * cercanía a la Costa Dorada (anillos de 10/30/60 km) > palabras buscadas presentes > tipo (con número: dirección >
 * calle > lugar > población; sin número, el lugar antes que la calle) > orden del proveedor.
 */
export function fusionarResultados(listas: (Candidato[] | null | undefined)[], consulta: Pick<ConsultaAnalizada, "numero" | "localidad"> & { nucleo?: string }, max = 8): LugarSugerido[] {
  const todos = listas.flatMap((l) => l ?? []).map((c): Candidato => {
    if (!consulta.numero || c.tipo !== "calle" || !c.calle) return c;
    const etiqueta = `${c.calle}, ${consulta.numero}${c.localidad ? ` · ${c.localidad}` : ""} (número aproximado)`;
    return { ...c, etiqueta, aproximado: true };
  });
  // Si el portal tecleado existe en el mapa, la calle «aproximada» sobra.
  const n = normalizarBusqueda(consulta.numero ?? "");
  const exacta = (c: Candidato) => todos.some((d) => d.tipo === "direccion" && normalizarBusqueda(d.numero ?? "") === n
    && normalizarBusqueda(d.calle ?? "") === normalizarBusqueda(c.calle ?? "") && normalizarBusqueda(d.localidad ?? "") === normalizarBusqueda(c.localidad ?? ""));
  // Calles y direcciones: misma calle + número + localidad; establecimientos: misma etiqueta. Y a < 30 m del mismo tipo.
  const claveDe = (c: Candidato) => (c.calle && c.tipo !== "poi" ? [c.calle, c.numero ?? "", c.localidad ?? ""] : [c.etiqueta]).map(normalizarBusqueda).join("|");
  const unicos: Candidato[] = [];
  for (const c of todos) {
    if (c.aproximado && exacta(c)) continue;
    const k = claveDe(c);
    if (!unicos.some((u) => claveDe(u) === k || (u.tipo === c.tipo && distanciaKm(u, c) < 0.03))) unicos.push(c);
  }
  const anillo = (c: Candidato) => { const d = distanciaKm(c, CENTRO_COSTA_DORADA); const i = ANILLOS_KM.findIndex((k) => d < k); return i < 0 ? ANILLOS_KM.length : i; };
  const orden = (c: Candidato, i: number) => [
    consulta.localidad && deLaLocalidad(c, consulta.localidad) ? 0 : 1, anillo(c),
    consulta.nucleo ? palabrasQueFaltan(c.etiqueta, consulta.nucleo) : 0, (consulta.numero ? ORDEN_TIPO : ORDEN_TIPO_SIN_NUMERO)[c.tipo], i,
  ];
  const ordenados = unicos.map((c, i) => ({ c, k: orden(c, i) })).sort((x, y) => {
    for (let i = 0; i < x.k.length; i++) if (x.k[i] !== y.k[i]) return x.k[i] - y.k[i];
    return 0;
  });
  return ordenados.slice(0, max).map(({ c }) => ({
    etiqueta: c.etiqueta, lat: c.lat, lng: c.lng, frecuente: false, fuente: c.fuente, ...(c.aproximado ? { aproximado: true } : {}),
  }));
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

/**
 * Respuesta de Nominatim «reverse» (de coordenadas a dirección, botón «Usar mi ubicación») → lugar con etiqueta
 * «Calle nº · Localidad»; null si no trae nada útil. Las coordenadas del lugar son las del móvil (más exactas).
 */
export function lugarDesdeReverse(json: unknown, lat: number, lng: number): LugarSugerido | null {
  const o = json as ObjNominatim | null;
  if (!o || typeof o !== "object" || !o.display_name) return null;
  const [c] = parsearNominatim([{ ...o, lat: String(lat), lon: String(lng) }]) ?? [];
  return c ? { etiqueta: c.etiqueta, lat, lng, frecuente: false, fuente: "nominatim" } : null;
}
