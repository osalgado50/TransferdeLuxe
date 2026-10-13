/**
 * Cálculo automático del ticket de combustible (lógica pura, web y app nativa): con el importe gastado, si el conductor
 * pone el €/L se calculan los litros, y si pone los litros se calcula el €/L. El campo que se calcula es siempre el del
 * par litros/€/L que NO ha escrito el conductor en último lugar (nunca se pisa lo que acaba de escribir).
 */
export type CampoImporte = "litros" | "precio" | "importe";
export type Derivado = "litros" | "precio" | null;
export interface Importes { litros: string; precio: string; importe: string }

/** «1,906» / «1.906» → 1.906; vacío o no positivo → null. */
export function numero(s: string): number | null {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
}
const conComa = (n: number) => String(n).replace(".", ",");
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Aplica lo que ha escrito el conductor en `editado` y recalcula el campo derivado. Devuelve los valores y cuál queda
 * como calculado (para recalcularlo si luego cambia el importe).
 */
export function recalcular(v: Importes, editado: CampoImporte, derivado: Derivado): { valores: Importes; derivado: Derivado } {
  const l = numero(v.litros), p = numero(v.precio), i = numero(v.importe);
  const litrosDe = (imp: number, pre: number) => ({ valores: { ...v, litros: conComa(r2(imp / pre)) }, derivado: "litros" as const });
  const precioDe = (imp: number, lit: number) => ({ valores: { ...v, precio: conComa(r3(imp / lit)) }, derivado: "precio" as const });
  if (editado === "precio") return i && p ? litrosDe(i, p) : { valores: v, derivado };
  if (editado === "litros") return i && l ? precioDe(i, l) : { valores: v, derivado };
  // Cambia el importe: se recalcula el que ya era calculado; si ninguno, el que falte.
  if (!i) return { valores: v, derivado };
  if (derivado === "litros" && p) return litrosDe(i, p);
  if (derivado === "precio" && l) return precioDe(i, l);
  if (derivado === null && p && !l) return litrosDe(i, p);
  if (derivado === null && l && !p) return precioDe(i, l);
  return { valores: v, derivado };
}
