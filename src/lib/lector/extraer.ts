import type { DatosTicket } from "./tipos";
import { ajustarNumeros, rangoPorDefecto, type DatosAjustados, type RangoPrecio } from "./plausibles";

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,3})?)`;
/** Lo que el OCR pone entre la etiqueta y el número: «:», «+:», «=», «[», puntos, rayas… («Litros +: 15,52»). */
const SEP = String.raw`[\s:+=.;|\[\](){}—–-]*`;
const aNumero = (s: string) => Number(s.replace(",", "."));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function buscar(texto: string, patrones: RegExp[]): number | null {
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) { const n = aNumero(m[1]); if (Number.isFinite(n) && n > 0) return n; }
  }
  return null;
}

function fecha(texto: string): string | null {
  const m = texto.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/);
  if (!m) return null;
  const d = Number(m[1]), mes = Number(m[2]);
  const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const f = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(f.getTime()) && f.toISOString().slice(0, 10) === iso ? iso : null;
}

function tipo(texto: string): string | null {
  const t = texto.toUpperCase();
  if (/DIESEL|GASOLEO|GASOIL|\bGO\s*A\b|E\+?\s*DIESEL/.test(t)) return "Diésel";
  if (/(SIN PLOMO|GASOLINA|S\.?P\.?|\bG|EFITEC|NEOTECH|ULTIMATE|OPTIMA)\s*98/.test(t)) return "Gasolina 98";
  if (/(SIN PLOMO|GASOLINA|S\.?P\.?|\bG|EFITEC|NEOTECH|OPTIMA)\s*95|SIN PLOMO|GASOLINA/.test(t)) return "Gasolina 95";
  if (/\bKWH\b|RECARGA|CARGADOR/.test(t)) return "Eléctrico";
  return null;
}

/** Hora del ticket: la de la línea de la fecha o la que va con «Hora»; si no, la primera HH:MM del ticket. */
function hora(texto: string): string | null {
  const conFecha = texto.match(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\D{0,12}?\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/);
  const conEtiqueta = texto.match(/HORA\W{0,4}([01]?\d|2[0-3])[:.h]([0-5]\d)\b/i);
  const cualquiera = texto.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const m = conFecha ?? conEtiqueta ?? cualquiera;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** ¿CIF (letra + 7 cifras + control) o NIF (8 cifras + letra) con su dígito/letra de control correcto? */
export function nifValido(c: string): boolean {
  if (/^\d{8}[A-Z]$/.test(c)) return "TRWAGMYFPDXBNJZSQVHLCKE"[Number(c.slice(0, 8)) % 23] === c[8];
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(c)) return false;
  const d = c.slice(1, 8).split("").map(Number);
  let suma = d[1] + d[3] + d[5];
  for (const i of [0, 2, 4, 6]) { const x = d[i] * 2; suma += Math.floor(x / 10) + (x % 10); }
  const k = (10 - (suma % 10)) % 10;
  return c[8] === String(k) || c[8] === "JABCDEFGHI"[k];
}
/** Lo que el OCR suele leer en lugar de la letra inicial del CIF. */
const LETRAS_OCR: Record<string, string[]> = { "8": ["B"], "0": ["D", "Q"], "6": ["G"], "4": ["A"], "5": ["S"], "1": ["J"] };
/**
 * CIF/NIF de la gasolinera (tras «CIF», «NIF»; tolera «C1F», «ElF»…). Solo se da por bueno si su dígito de control
 * cuadra: así no se cuela un CIF mal leído. Prueba también las letras que el OCR confunde con números (8 → B…).
 */
export function nif(texto: string): string | null {
  const re = /\b(?:[CE][\s.]?[I1lL][\s.]?F|N[\s.]?[I1l][\s.]?F)\b[^A-Z0-9\n]{0,6}([A-Z0-9][A-Z0-9 .-]{7,11})/gi;
  for (const m of texto.matchAll(re)) {
    const c = m[1].toUpperCase().replace(/[ .-]/g, "").slice(0, 9);
    const candidatos = [c, ...(LETRAS_OCR[c[0]] ?? []).map((l) => l + c.slice(1))];
    const bueno = candidatos.find(nifValido);
    if (bueno) return bueno;
  }
  return null;
}

/** Línea de la gasolinera sin el ruido que a veces mete el OCR delante («O PLENERGY…», «— REPSOL»). */
const limpiarLinea = (l: string) => l.replace(/^(?:[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+|[A-Za-z]{1,2}[)\].]?\s+)(?=[A-ZÁÉÍÓÚÑ]{3})/, "").trim();

/** Nº de factura / factura simplificada / ticket. */
function factura(texto: string): string | null {
  // Todas las apariciones («Ticket ejemplo» no es un número de ticket): la primera que tenga cifras.
  const re = /(?:FACTURA(?:\s+SIMPLIFICADA)?|FRA\.?|TICKET)\s*(?:N[º°O.]?\s*)?[:|\s\[({]*([A-Z0-9][A-Z0-9\/-]{4,30})/gi;
  for (const m of texto.matchAll(re)) if (/\d{3}/.test(m[1])) return m[1].toUpperCase();
  return null;
}

/** Base imponible, % de IVA y cuota de IVA; si faltan, se completan entre sí (base + cuota = importe). */
function fiscal(t: string, importe: number | null): { base_imponible: number | null; iva_pct: number | null; iva_importe: number | null } {
  let base = buscar(t, [new RegExp(String.raw`(?:BASE\s*IMPONIBLE|B\s*[.,]?\s*I(?:MP|NP|MR|NR)\w*\.?|BASE)` + SEP + NUM, "i")]);
  let cuota = buscar(t, [new RegExp(String.raw`(?:IMP\w*\.?\s*(?:IVA|1VA|I\.V\.A\.)|CUOTA(?:\s+IVA)?|TOTAL\s+IVA)` + SEP + NUM, "i")]);
  let pct = buscar(t, [/(?:IVA|1VA|I\.V\.A\.)[^0-9%\n]{0,8}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i, /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:IVA|1VA)/i]);
  const TIPOS = [21, 10, 5, 4];
  if (pct != null && !TIPOS.includes(pct)) pct = null;
  if (base != null && importe != null && base > importe) base = null;
  if (cuota != null && importe != null && cuota >= importe) cuota = null;
  if (!base && !cuota && !pct) return { base_imponible: null, iva_pct: null, iva_importe: null };
  if (importe != null) {
    if (base != null && cuota == null) cuota = r2(importe - base);
    if (cuota != null && base == null) base = r2(importe - cuota);
    if (base == null && cuota == null && pct != null) { base = r2(importe / (1 + pct / 100)); cuota = r2(importe - base); }
  }
  if (pct == null && base && cuota) {
    const calc = (cuota / base) * 100;
    pct = TIPOS.find((x) => Math.abs(x - calc) < 0.6) ?? null;
  }
  return { base_imponible: base != null ? r2(base) : null, iva_pct: pct, iva_importe: cuota != null ? r2(cuota) : null };
}

/** Marcas de gasolinera habituales en España: si sale alguna, manda sobre «la primera línea en mayúsculas». */
const MARCAS = ["REPSOL", "CEPSA", "MOEVE", "GALP", "SHELL", "PLENERGY", "BALLENOIL", "PETRONOR", "PETROPRIX", "ESCLAT", "BONAREA",
  "CARREFOUR", "ALCAMPO", "EROSKI", "AVIA", "DISA", "MEROIL", "PETROCAT", "VALCARCE", "Q8", "BP", "ESSO", "TAMOIL", "CAMPSA"];

function gasolinera(texto: string): string | null {
  const lineas = texto.split(/\r?\n/).map((l) => limpiarLinea(l.trim())).filter(Boolean);
  const conMarca = lineas.find((l) => MARCAS.some((m) => new RegExp(`\\b${m}\\b`, "i").test(l)) && l.length <= 60);
  if (conMarca) return conMarca;
  const linea = lineas.find((l) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,&'-]{2,}$/.test(l) && /[A-Z]{3}/.test(l));
  return linea ?? null;
}

/**
 * Datos del ticket a partir del texto del OCR. `rango`: precios del día del combustible (servidor, Ministerio); sin él,
 * un rango orientativo. Los números se corrigen con `ajustarNumeros` (coma en su sitio, litros × €/L ≈ importe).
 */
export function extraerDatosTicket(texto: string, rango?: RangoPrecio): DatosAjustados {
  const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ \t]+/g, " ");
  let litros = buscar(t, [
    new RegExp(String.raw`(?:LITROS|VOLUMEN|CANTIDAD|\bLTS?)` + SEP + NUM, "i"),
    new RegExp(NUM + String.raw`\s*(?:L|\bLTS?|LITROS)\b(?!\s*\/)`, "i"),
  ]);
  let precio = buscar(t, [
    new RegExp(String.raw`(?:PRECIO|P\.?\s*UNIT\.?)\s*(?:\/\s*L)?` + SEP + NUM, "i"),
    new RegExp(NUM + String.raw`\s*(?:€|EUR)?\s*\/\s*L`, "i"),
  ]);
  const importe = buscar(t, [
    // Prepago: «Total reservado 20,00» / «Total suministrado 18,40»: lo que cuenta es lo suministrado.
    new RegExp(String.raw`TOTAL\s+SU[MN]+I\w*` + SEP + NUM, "i"),
    new RegExp(String.raw`(?<!SUB\s?)TOTAL` + SEP + String.raw`(?:A PAGAR|\(?EUR\)?|€)?` + SEP + NUM, "i"),
    new RegExp(String.raw`IMPORTE` + SEP + NUM, "i"),
  ]);
  if (litros != null) litros = r2(litros);
  if (precio == null && litros && importe) precio = r3(importe / litros);
  if (litros == null && precio && importe) litros = r2(importe / precio);

  const datos: DatosTicket = {
    fecha: fecha(t), gasolinera: gasolinera(texto), litros, precio_litro: precio,
    importe: importe != null ? r2(importe) : null, tipo_combustible: tipo(t), confianza: "baja",
  };
  const ajustados = ajustarNumeros(datos, rango ?? rangoPorDefecto(datos.tipo_combustible));
  return { ...ajustados, hora: hora(t), nif: nif(t), factura: factura(t), ...fiscal(t, ajustados.importe) };
}
