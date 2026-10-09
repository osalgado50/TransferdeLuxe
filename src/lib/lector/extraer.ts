import type { DatosTicket } from "./tipos";
import { esCoherente } from "./parsear";

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,3})?)`;
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
  if (/DIESEL|GAS[OÓ]LEO/.test(t)) return "Diésel";
  if (/(SIN PLOMO|GASOLINA|SP)\s*98/.test(t)) return "Gasolina 98";
  if (/(SIN PLOMO|GASOLINA|SP)\s*95|SIN PLOMO|GASOLINA/.test(t)) return "Gasolina 95";
  return null;
}

function gasolinera(texto: string): string | null {
  const linea = texto.split(/\r?\n/).map((l) => l.trim()).find((l) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 .,&'-]{2,}$/.test(l) && /[A-Z]{3}/.test(l));
  return linea ?? null;
}

export function extraerDatosTicket(texto: string): DatosTicket {
  const t = texto.replace(/[ \t]+/g, " ");
  let litros = buscar(t, [
    new RegExp(String.raw`(?:LITROS|VOLUMEN|LTS?)\s*:?\s*` + NUM, "i"),
    new RegExp(NUM + String.raw`\s*(?:L|LTS?|LITROS)\b(?!\s*\/)`, "i"),
  ]);
  let precio = buscar(t, [
    new RegExp(String.raw`(?:PRECIO|P\.?\s*UNIT\.?)\s*(?:\/\s*L)?\s*:?\s*` + NUM, "i"),
    new RegExp(NUM + String.raw`\s*(?:€|EUR)?\s*\/\s*L`, "i"),
  ]);
  const importe = buscar(t, [
    new RegExp(String.raw`(?<!SUB)TOTAL\s*:?\s*` + NUM, "i"),
    new RegExp(String.raw`IMPORTE\s*:?\s*` + NUM, "i"),
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
