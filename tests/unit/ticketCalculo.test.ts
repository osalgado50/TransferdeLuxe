import { describe, expect, test } from "vitest";
import { numero, recalcular, type Importes } from "@/lib/dominio/ticketCalculo";

const v = (litros: string, precio: string, importe: string): Importes => ({ litros, precio, importe });

describe("cálculo automático del ticket", () => {
  test("pongo el €/L (1,906) con el importe: se calculan los litros", () => {
    expect(recalcular(v("", "1,906", "60"), "precio", null)).toEqual({ valores: v("31,48", "1,906", "60"), derivado: "litros" });
  });
  test("pongo los litros con el importe: se calcula el €/L", () => {
    expect(recalcular(v("31,48", "", "60"), "litros", null)).toEqual({ valores: v("31,48", "1,906", "60"), derivado: "precio" });
  });
  test("corrijo el €/L leído del ticket: los litros se recalculan (no se pisa el €/L que escribo)", () => {
    const r = recalcular(v("16,5", "1,287", "20"), "precio", null);
    expect(r.valores).toEqual(v("15,54", "1,287", "20"));
  });
  test("cambio el importe: se recalcula el campo que ya era calculado", () => {
    expect(recalcular(v("31,48", "1,906", "50"), "importe", "litros").valores.litros).toBe("26,23");
    expect(recalcular(v("30", "2", "45"), "importe", "precio").valores.precio).toBe("1,5");
  });
  test("cambio el importe sin nada calculado: se calcula el que falte; si están los dos, no se toca", () => {
    expect(recalcular(v("", "1,5", "45"), "importe", null).valores.litros).toBe("30");
    expect(recalcular(v("30", "", "45"), "importe", null).valores.precio).toBe("1,5");
    expect(recalcular(v("30", "1,6", "45"), "importe", null).valores).toEqual(v("30", "1,6", "45"));
  });
  test("sin importe, a medio escribir o con ceros: no calcula", () => {
    expect(recalcular(v("", "1,906", ""), "precio", null).valores.litros).toBe("");
    expect(recalcular(v("", "0", "60"), "precio", null).valores.litros).toBe("");
    expect(recalcular(v("", "", "60"), "precio", "litros").valores.litros).toBe("");
    expect(numero("1.906")).toBe(1.906);
    expect(numero("abc")).toBeNull();
  });
});
