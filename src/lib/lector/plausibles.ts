import type { DatosTicket } from "./tipos";

/**
 * Corrige los números que lee el OCR con sentido común (lógica pura).
 *
 * El OCR se come comas («1,289» → 1289), confunde dígitos («15,52» → 16,5) y a veces no ve un campo. Con tres datos que
 * se vigilan entre sí (litros × €/L ≈ importe) y unos rangos razonables, casi siempre se puede reconstruir el ticket:
 * - El €/L se pone en su sitio dividiendo por 10, 100, 1000… hasta caer en el rango del combustible (mejor si es el
 *   rango del día que publica el Ministerio, ver `preciosCarburante.ts`).
 * - Se prueba la combinación de litros / €/L / importe (cada uno con su coma en distintos sitios) que mejor cuadra.
 * - Si no cuadra ninguna, se fían el importe (el total, en letra grande) y el €/L y se recalculan los litros.
 */
export interface RangoPrecio { min: number; max: number; medio: number; fuente: string }

/** Sin referencia del día: rangos amplios (2026) por tipo de combustible. */
export function rangoPorDefecto(tipo: string | null): RangoPrecio {
  if (tipo === "Eléctrico") return { min: 0.1, max: 1, medio: 0.45, fuente: "rango orientativo" };
  return { min: 0.9, max: 2.6, medio: 1.55, fuente: "rango orientativo" };
}
export const LITROS = { min: 1, max: 150 };
export const IMPORTE = { min: 2, max: 400 };
const TOLERANCIA = 0.03; // 3 %: el redondeo del surtidor y algún céntimo de diferencia

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const dentro = (n: number, r: { min: number; max: number }) => n >= r.min && n <= r.max;
/** El número con la coma en otros sitios (1289 → 1289, 128,9, 12,89, 1,289, 0,1289). */
const comas = (n: number) => [1, 10, 100, 1000, 10000].map((d) => n / d);

/** Mediana, mínimo y máximo de una lista de precios (descarta ceros y absurdos). */
export function estadisticas(precios: number[], fuente: string): RangoPrecio | null {
  const xs = precios.filter((p) => Number.isFinite(p) && p > 0.05 && p < 10).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const medio = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return { min: xs[0], max: xs[xs.length - 1], medio: r3(medio), fuente };
}

export type DatosAjustados = DatosTicket & { avisos?: string[] };

/** `hoy` («AAAA-MM-DD»): el aviso de «precio fuera de lo habitual hoy» solo vale para tickets de los últimos 15 días. */
export function ajustarNumeros(d: DatosTicket, rango: RangoPrecio = rangoPorDefecto(d.tipo_combustible), hoy = new Date().toISOString().slice(0, 10)): DatosAjustados {
  const avisos: string[] = [];
  // El €/L puede variar algo respecto a la referencia (otro día, otra zona): margen del 25 %.
  const rp = { min: rango.min * 0.75, max: rango.max * 1.25 };
  const cand = (n: number | null, r: { min: number; max: number }) => (n == null ? [] : comas(n).filter((x) => dentro(x, r)));
  const ls = cand(d.litros, LITROS), ps = cand(d.precio_litro, rp), is = cand(d.importe, IMPORTE);

  // 1) La combinación que mejor cuadra (con preferencia por no mover la coma).
  let mejor: { l: number; p: number; i: number; err: number } | null = null;
  for (const l of ls) for (const p of ps) for (const i of is) {
    const err = Math.abs(l * p - i) / i;
    const movidas = [l !== d.litros, p !== d.precio_litro, i !== d.importe].filter(Boolean).length;
    const nota = err + movidas * 0.001;
    if (!mejor || nota < mejor.err) mejor = { l, p, i, err: nota };
  }
  let litros = d.litros, precio = d.precio_litro, importe = d.importe;
  if (mejor && mejor.err <= TOLERANCIA + 0.003) {
    ({ l: litros, p: precio, i: importe } = mejor);
  } else {
    // 2) No cuadra: se fían el importe y el €/L (con su coma en el rango) y se recalculan los litros; si falta uno, se
    //    calcula con los otros dos.
    const p = ps.sort((a, b) => Math.abs(a - rango.medio) - Math.abs(b - rango.medio))[0] ?? null;
    const i = is.includes(d.importe ?? NaN) ? d.importe : is[0] ?? null;
    const l = ls.includes(d.litros ?? NaN) ? d.litros : ls[0] ?? null;
    if (p != null && i != null && dentro(i / p, LITROS)) {
      if (l != null && l !== r2(i / p)) avisos.push(`Litros recalculados con importe ÷ precio (el ticket parecía decir ${String(d.litros).replace(".", ",")}).`);
      litros = r2(i / p); precio = p; importe = i;
    } else if (l != null && i != null && dentro(i / l, rp)) {
      litros = l; importe = i; precio = r3(i / l);
      if (d.precio_litro != null) avisos.push("Precio por litro recalculado con importe ÷ litros.");
    } else if (l != null && p != null && dentro(l * p, IMPORTE)) {
      litros = l; precio = p; importe = r2(l * p);
      if (d.importe != null) avisos.push("Importe recalculado con litros × precio.");
    } else {
      // Nada cuadra: se deja lo leído (con la coma en su sitio si se pudo) y se avisa abajo de lo que se salga de lo normal.
      litros = l ?? d.litros; precio = p ?? d.precio_litro; importe = i ?? d.importe;
    }
  }
  if (precio != null && d.precio_litro != null && precio !== d.precio_litro && comas(d.precio_litro).some((x) => Math.abs(x - precio!) < 1e-9)) {
    avisos.push(`Precio por litro corregido (${String(d.precio_litro).replace(".", ",")} → ${String(precio).replace(".", ",")} €/L).`);
  }
  const reciente = !d.fecha || Date.parse(hoy) - Date.parse(d.fecha) <= 15 * 86400e3;
  if (precio != null && reciente && !dentro(precio, rango)) {
    avisos.push(`El precio (${String(precio).replace(".", ",")} €/L) se sale de lo habitual hoy (${rango.min.toFixed(2).replace(".", ",")}–${rango.max.toFixed(2).replace(".", ",")} €/L, ${rango.fuente}).`);
  }
  const datos: DatosAjustados = {
    ...d, litros: litros != null ? r2(litros) : null, precio_litro: precio != null ? r3(precio) : null, importe: importe != null ? r2(importe) : null,
  };
  const cuadra = datos.litros != null && datos.precio_litro != null && datos.importe != null
    && Math.abs(datos.litros * datos.precio_litro - datos.importe) <= Math.max(0.1, datos.importe * 0.02);
  datos.confianza = cuadra ? (avisos.length ? "media" : datos.fecha ? "alta" : "media") : "baja";
  if (avisos.length) datos.avisos = avisos;
  return datos;
}
