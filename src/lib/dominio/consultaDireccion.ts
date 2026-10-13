// Limpieza de lo que teclea el usuario antes de preguntar a Photon/Nominatim (lógica pura, sin red):
// abreviaturas → palabra completa, fuera piso/puerta/escalera, provincia, país y código postal, y detección de
// la localidad conocida (para buscar solo alrededor de ella). Ejemplo real:
// «Dr. Eduard Punset 7, 3-1 de Salou. Tarragona» → «Doctor Eduard Punset 7 Salou» (número 7, localidad Salou).
import { ZONAS } from "./zonas";

/** Minúsculas y sin acentos (la «l·l» y el apóstrofo se conservan). */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ABREVIATURAS: Record<string, string> = {
  dr: "Doctor", dra: "Doctora", av: "Avinguda", avd: "Avinguda", avda: "Avinguda", avgda: "Avinguda", avg: "Avinguda",
  pg: "Passeig", "pº": "Passeig", pso: "Passeig", ctra: "Carretera", crta: "Carretera", pl: "Plaça", pza: "Plaça",
  plz: "Plaça", pca: "Plaça", urb: "Urbanització", gral: "General", sta: "Santa", st: "Sant", mn: "Mossèn", cl: "Carrer",
};

/** Palabras de tipo de vía (sin acentos): delante de una localidad indican que es parte del nombre de la calle. */
const TIPOS_VIA = new Set([
  "carrer", "calle", "avinguda", "avenida", "passeig", "paseo", "placa", "plaza", "carretera", "cami", "camino", "ronda",
  "rambla", "travessera", "travesia", "via", "urbanitzacio", "urbanizacion", "passatge", "pasaje", "baixada", "pujada",
]);
const ARTICULOS = new Set(["de", "del", "d'", "la", "les", "el", "els", "l'"]);
/** Palabras genéricas de un establecimiento: Photon no encuentra «hotel piramide» pero sí «piramide». */
const GENERICAS = new Set([
  "hotel", "hostal", "aparthotel", "apartaments", "apartamentos", "apartamento", "camping", "restaurant", "restaurante",
  "bar", "edifici", "edificio", "residencial", "complejo", "complex",
]);
/** Piso/puerta sueltos tras el número de portal. */
const PISO_SUELTO = new Set([
  "bajo", "bajos", "baixos", "baix", "bj", "bjo", "atico", "atic", "sobreatico", "entresuelo", "entlo", "entl",
  "principal", "pral", "izq", "izda", "izquierda", "dcha", "dch", "derecha", "dreta", "esquerra", "interior", "exterior", "duplex",
]);
/** Palabras de piso/puerta que llevan un valor detrás («esc. B», «piso 3», «puerta 2»). */
const PISO_CON_VALOR = new Set([
  "piso", "pis", "planta", "pl", "puerta", "porta", "pta", "esc", "escalera", "escala", "bloque", "bloc", "bl", "portal", "apto", "apt", "local",
]);
const FUERA = new Set(["espana", "spain", "espanya", "catalunya", "cataluna", "catalonia", "provincia", "prov"]);
const PROVINCIAS = new Set(["Tarragona", "Barcelona", "Lleida", "Girona"]);

const RE_NUMERO = /^\d{1,4}[a-z]?([-/]\d{1,4}[a-z]?)?$/i;
const RE_ORDINAL = /^\d{1,3}[ºª°o]$/i;
const RE_PISO = /^(\d{1,3}[ºª°oa]?([-/]\d{1,3}[ºª°oa]?[a-z]?)?|\d{1,3}[ºª°][a-z]|[a-h]|[ºª°])$/i;

export interface LocalidadConocida { nombre: string; lat: number; lng: number; alias: string[]; municipios: string[]; radioKm: number }

// Localidades de zonas.ts (sin aeropuertos ni estaciones) con alias sin acentos; `municipios`: nombres con los que
// Photon/Nominatim pueden etiquetar sus calles (La Pineda es de Vila-seca, Miami Platja de Mont-roig…).
const EXTRA: Record<string, { alias?: string[]; municipios?: string[] }> = {
  "La Pineda": { alias: ["pineda", "la pineda de vila-seca"], municipios: ["vila-seca"] },
  "Vila-seca": { alias: ["vilaseca", "vila seca"], municipios: ["la pineda"] },
  "Mont-roig del Camp": { alias: ["mont-roig", "montroig", "mont roig", "montroig del camp", "mont roig del camp"], municipios: ["miami platja"] },
  "Miami Platja": { alias: ["miami", "miami playa"], municipios: ["mont-roig del camp"] },
  "L'Hospitalet de l'Infant": { alias: ["hospitalet de l'infant", "l'hospitalet", "hospitalet del infante", "l hospitalet de l infant", "hospitalet de l infant"], municipios: ["vandellos i l'hospitalet de l'infant", "vandellos"] },
  "Vandellòs": { municipios: ["vandellos i l'hospitalet de l'infant"] },
  "Sant Carles de la Ràpita": { alias: ["la rapita", "rapita"] },
  "Coma-ruga": { alias: ["comarruga", "coma ruga"], municipios: ["el vendrell"] },
  "Roda de Berà": { alias: ["roda de bara", "roda de bera"] },
  "L'Ametlla de Mar": { alias: ["ametlla de mar", "l'ametlla"] },
  "Vilanova i la Geltrú": { alias: ["vilanova"] },
};

export const LOCALIDADES: readonly LocalidadConocida[] = ZONAS.filter((z) => !z.el && z.nombre !== "PortAventura").map((z) => {
  const e = EXTRA[z.nombre] ?? {};
  const base = plano(z.nombre);
  const alias = [...new Set([base, base.replace(/-/g, " "), ...(e.alias ?? [])])];
  // Capitales de provincia: radio mayor (quien escribe «…, Tarragona» puede referirse a la provincia: Salou está a 9 km).
  const radioKm = PROVINCIAS.has(z.nombre) ? 15 : 8;
  return { nombre: z.nombre, lat: z.lat, lng: z.lng, alias, municipios: [base, ...(e.municipios ?? [])], radioKm };
});

// Alias de más largo a más corto: «la pineda» antes que «pineda», «mont-roig del camp» antes que «mont-roig».
const ALIAS = LOCALIDADES.flatMap((l) => l.alias.map((a) => ({ a: a.split(" "), l }))).sort((x, y) => y.a.length - x.a.length);

/** Trocea el texto en palabras: fuera puntuación (salvo guion, apóstrofo y º/ª), «s/n», «nº», «c/», CP y país. */
function trocear(texto: string): string[] {
  const s = texto.normalize("NFC")
    .replace(/[’`´]/g, "'")
    .replace(/\bs\s*\/\s*n\b\.?/gi, " ")
    .replace(/(^|[\s,.(])c\s*\/\s*/gi, "$1Carrer ")
    .replace(/\b(n[º°]|num\.|núm\.|nº\.)\s*/gi, " ")
    .replace(/(^|\s)p[º°]\.?\s*/gi, "$1Passeig ")
    .replace(/[,.;:()"«»“”!?¿¡/\\]+/g, " ");
  return s.split(/\s+/).filter(Boolean).filter((t) => !/^\d{5}$/.test(t) && !FUERA.has(plano(t)));
}

export interface ConsultaAnalizada {
  /** Lo que se manda primero al buscador: «Doctor Eduard Punset 7 Salou». */
  limpia: string;
  /** Número de portal tecleado («7», «12-14», «7B»); null si no hay. */
  numero: string | null;
  /** Localidad conocida detectada (la de la dirección, no la del nombre de la calle). */
  localidad: LocalidadConocida | null;
  /** Variante de respaldo: sin número, tipo de vía, palabras genéricas ni localidad («Doctor Eduard Punset»). */
  nucleo: string;
}

/** «Carrer», «Avinguda», «Passeig»… (con o sin acentos). */
export const esTipoVia = (t: string) => TIPOS_VIA.has(plano(t));

/** ¿La palabra i va justo después de un tipo de vía (con artículos en medio)? «Carrer (de) Barcelona». */
function trasTipoVia(t: string[], i: number): boolean {
  let j = i - 1;
  while (j >= 0 && ARTICULOS.has(plano(t[j]))) j--;
  return j >= 0 && esTipoVia(t[j]);
}

export function analizarConsulta(texto: string): ConsultaAnalizada {
  let t = trocear(texto);

  // Número de portal: la primera cifra tras alguna palabra («11 de Setembre» es nombre de calle, no portal).
  // Un ordinal («3º», «3o») antes de cualquier cifra ya es el piso: entonces no hay portal.
  let iNum = -1, iPiso = -1;
  for (let i = 1; i < t.length; i++) {
    if (RE_ORDINAL.test(t[i])) { iPiso = i; break; }
    if (RE_NUMERO.test(t[i]) && !(t[i + 1] && /^(de|d')$/i.test(t[i + 1]) && /^\d{1,2}$/.test(t[i]))) { iNum = i; iPiso = i + 1; break; }
  }
  // Abreviaturas (en la calle, no en el piso; las letras sueltas solo en la primera palabra: «C. Major»).
  t = t.map((x, i) => {
    if (iNum >= 0 && i >= iNum) return x;
    const k = plano(x);
    if (i === 0 && k === "c") return "Carrer";
    return ABREVIATURAS[k] ?? x;
  });
  // Del piso en adelante: fuera piso, puerta, escalera… (queda lo demás: «de Salou», «Tarragona»).
  if (iPiso >= 0) {
    const resto: string[] = [];
    for (let i = iPiso; i < t.length; i++) {
      const k = plano(t[i]);
      if (PISO_CON_VALOR.has(k)) { if (t[i + 1] && t[i + 1].length <= 3) i++; continue; }
      if (PISO_SUELTO.has(k) || RE_PISO.test(t[i])) continue;
      resto.push(t[i]);
    }
    t = [...t.slice(0, iPiso), ...resto];
  }

  // Localidades mencionadas (no las que forman parte del nombre de la calle).
  const k = t.map(plano);
  const encontradas: { ini: number; fin: number; l: LocalidadConocida }[] = [];
  const usado = new Array(t.length).fill(false);
  for (const { a, l } of ALIAS) {
    for (let i = 0; i + a.length <= k.length; i++) {
      if (usado.slice(i, i + a.length).some(Boolean) || a.some((p, j) => k[i + j] !== p)) continue;
      if (trasTipoVia(t, i) || (iNum >= 0 && i < iNum)) continue;
      for (let j = i; j < i + a.length; j++) usado[j] = true;
      encontradas.push({ ini: i, fin: i + a.length, l });
    }
  }
  encontradas.sort((x, y) => x.ini - y.ini);
  let loc = encontradas.at(-1) ?? null;
  const quitar = new Set<number>();
  // «… Salou, Tarragona»: la provincia del final sobra.
  if (loc && encontradas.length > 1 && PROVINCIAS.has(loc.l.nombre)) {
    for (let j = loc.ini; j < loc.fin; j++) quitar.add(j);
    loc = encontradas.at(-2)!;
  }
  if (loc) {
    // «de Salou» / «en Salou» → «Salou».
    for (let j = loc.ini - 1; j > Math.max(iNum, 0) && /^(de|en|a)$/i.test(t[j]); j--) quitar.add(j);
  }
  // Palabras genéricas («hotel»…) fuera si queda algo más que la localidad: Photon tarda > 5 s con «hotel piramide
  // Salou» (medido: 7,2 s) y responde al momento con «piramide Salou».
  const enLoc = (i: number) => !!loc && i >= loc.ini && i < loc.fin;
  const generica = (i: number) => (iNum < 0 || i < iNum) && GENERICAS.has(k[i]);
  if (t.some((_, i) => !quitar.has(i) && !enLoc(i) && !generica(i))) t.forEach((_, i) => { if (generica(i)) quitar.add(i); });
  // Consulta limpia: la localidad se queda en su sitio con su nombre oficial («montroig» → «Mont-roig del Camp»).
  const partes: string[] = [];
  t.forEach((x, i) => {
    if (quitar.has(i) || (loc && i > loc.ini && i < loc.fin)) return;
    partes.push(loc && i === loc.ini ? loc.l.nombre : x);
  });
  const numero = iNum >= 0 ? t[iNum] : null;

  // Núcleo (respaldo): la calle o el nombre sin número, localidad ni palabras genéricas («hotel piramide» → «piramide»).
  const nucleoT = t.filter((x, i) => (iNum < 0 || i < iNum) && !quitar.has(i) && !enLoc(i) && !GENERICAS.has(k[i]));
  while (nucleoT.length && ARTICULOS.has(plano(nucleoT[0]))) nucleoT.shift();

  return { limpia: partes.join(" ") || texto.trim(), numero, localidad: loc?.l ?? null, nucleo: nucleoT.join(" ") };
}

/** Texto ya limpio que se manda al buscador (atajo de analizarConsulta). */
export const normalizarConsulta = (texto: string) => analizarConsulta(texto).limpia;

/** Consultas a probar en orden: la limpia y, si no da nada, el núcleo (sin repetir ni quedarse en < 3 letras). */
export function variantesConsulta(c: ConsultaAnalizada): string[] {
  const v = [c.limpia];
  if (c.nucleo.length >= 3 && plano(c.nucleo) !== plano(c.limpia)) v.push(c.nucleo);
  return v;
}

/** Caja de ~`km` alrededor de un punto: [oeste, sur, este, norte]. */
export function cajaAlrededor(lat: number, lng: number, km = 8): [number, number, number, number] {
  const dLat = km / 111.32, dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const r = (x: number) => Math.round(x * 10_000) / 10_000;
  return [r(lng - dLng), r(lat - dLat), r(lng + dLng), r(lat + dLat)];
}
