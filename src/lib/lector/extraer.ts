import type { DatosTicket } from "./tipos";
import { esCoherente } from "./parsear";

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

/** Marcas de gasolinera habituales en España: si sale alguna, manda sobre «la primera línea en mayúsculas». */
const MARCAS = ["REPSOL", "CEPSA", "MOEVE", "GALP", "SHELL", "PLENERGY", "BALLENOIL", "PETRONOR", "PETROPRIX", "ESCLAT", "BONAREA",
  "CARREFOUR", "ALCAMPO", "EROSKI", "AVIA", "DISA", "MEROIL", "PETROCAT", "VALCARCE", "Q8", "BP", "ESSO", "TAMOIL", "CAMPSA"];

function gasolinera(texto: string): string | null {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const conMarca = lineas.find((l) => MARCAS.some((m) => new RegExp(`\\b${m}\\b`, "i").test(l)) && l.length <= 60);
  if (conMarca) return conMarca;
  const linea = lineas.find((l) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,&'-]{2,}$/.test(l) && /[A-Z]{3}/.test(l));
  return linea ?? null;
}

export function extraerDatosTicket(texto: string): DatosTicket {
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
  if (datos.litros && datos.importe && esCoherente(datos)) datos.confianza = datos.fecha ? "alta" : "media";
  return datos;
}
