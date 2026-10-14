import { describe, expect, test } from "vitest";
import { extraerDatosTicket } from "@/lib/lector/extraer";
import { ajustarNumeros, estadisticas, lecturaCompleta, mejorLectura, rangoPorDefecto, type RangoPrecio } from "@/lib/lector/plausibles";
import type { DatosTicket } from "@/lib/lector/tipos";

const base: DatosTicket = { fecha: "2024-04-25", gasolinera: "X", litros: null, precio_litro: null, importe: null, tipo_combustible: "Diésel", confianza: "baja" };
const DIESEL_HOY: RangoPrecio = { min: 1.35, max: 1.79, medio: 1.52, fuente: "Ministerio, Tarragona" };

describe("corregir los números del OCR", () => {
  test("foto del móvil a una pantalla: «Litros 16,50 · Precio 1287 · Importe 20,00» → 15,54 L a 1,287 €/L", () => {
    // Texto real de tesseract con una foto del iPhone a la pantalla (ticket de ejemplo público de Plenergy).
    const ocr = "Ticket ejemplo\nPLENERGY GRUPO, S.L.\nCIF 699275394\n(1) Fecha( 25/04/2024) 16:55\nTurno: 1468\nProducto : DIESEL\n" +
      "Litros + 16,50\nPrecio + 1287\nImporte : 20,00\n1A : 21,00%\nImp. IVA : 3,47\nTotal reservado: 20,00 Eur\n3) Totol suninist. : (20,00 Eur)";
    const d = extraerDatosTicket(ocr);
    expect(d).toMatchObject({ fecha: "2024-04-25", gasolinera: "PLENERGY GRUPO, S.L.", litros: 15.54, precio_litro: 1.287, importe: 20, tipo_combustible: "Diésel" });
    expect(d.confianza).toBe("media");
    expect(d.avisos?.join(" ")).toMatch(/Litros recalculados/);
    expect(d.avisos?.join(" ")).toMatch(/1287 → 1,287/);
  });
  test("bien leído: no toca nada y confianza alta", () => {
    const d = ajustarNumeros({ ...base, litros: 15.52, precio_litro: 1.289, importe: 20 });
    expect(d).toMatchObject({ litros: 15.52, precio_litro: 1.289, importe: 20, confianza: "alta" });
    expect(d.avisos).toBeUndefined();
  });
  test("comas perdidas en los tres campos: 4215 L, 1459 €/L, 6150 € → 42,15 L, 1,459 €/L, 61,50 €", () => {
    expect(ajustarNumeros({ ...base, litros: 4215, precio_litro: 1459, importe: 6150 })).toMatchObject({ litros: 42.15, precio_litro: 1.459, importe: 61.5 });
  });
  test("falta el precio: se calcula con importe ÷ litros", () => {
    expect(ajustarNumeros({ ...base, litros: 30, importe: 45 })).toMatchObject({ precio_litro: 1.5, confianza: "alta" });
  });
  test("falta el importe: litros × precio", () => {
    expect(ajustarNumeros({ ...base, litros: 30, precio_litro: 1.5 })).toMatchObject({ importe: 45 });
  });
  test("con la referencia del día: el precio que se sale de lo habitual se avisa", () => {
    const d = ajustarNumeros({ ...base, fecha: "2026-10-12", litros: 10, precio_litro: 2.9, importe: 29 }, DIESEL_HOY, "2026-10-13");
    expect(d.avisos?.join(" ")).toMatch(/se sale de lo habitual hoy \(1,35–1,79 €\/L, Ministerio, Tarragona\)/);
    // Un ticket antiguo no se compara con los precios de hoy.
    expect(ajustarNumeros({ ...base, litros: 10, precio_litro: 1.289, importe: 12.89 }, DIESEL_HOY, "2026-10-13").avisos).toBeUndefined();
  });
  test("con la referencia, el €/L ambiguo se coloca cerca del precio medio", () => {
    // 1529 sin coma: 1,529 (cerca de 1,52) y no 15,29.
    expect(ajustarNumeros({ ...base, litros: null, precio_litro: 1529, importe: 61.16 }, DIESEL_HOY).precio_litro).toBe(1.529);
  });
  test("eléctrico: €/kWh en su rango", () => {
    expect(rangoPorDefecto("Eléctrico").max).toBeLessThan(1.5);
    expect(ajustarNumeros({ ...base, tipo_combustible: "Eléctrico", litros: 40, precio_litro: 39, importe: 15.6 })).toMatchObject({ precio_litro: 0.39 });
  });
});

describe("estadísticas de precios", () => {
  test("mediana, mínimo y máximo; descarta ceros y absurdos", () => {
    expect(estadisticas([1.729, 1.459, 0, 1.52, 1.6, 99], "x")).toEqual({ min: 1.459, max: 1.729, medio: 1.56, fuente: "x" });
    expect(estadisticas([1.5], "x")).toBeNull();
  });
});

describe("varias lecturas del mismo ticket", () => {
  const normal = extraerDatosTicket("PLENERGY GRUPO, S.L.\nCIF + 893275394\nFecha:| 25/04/2024 | 16:55\nFactura simplificada: | 039R2400065003\nProducto : DIESEL\nEle A\nMECO “1 209\nImporte : 20,00\nTotal suminist. : (20,00 Eur");
  const umbral = extraerDatosTicket("CIF + 893275394\nFecha:| 25/04/2024 | 16:55\nProducto : DIESEL\nLitros : 15,52\nPrecio : 1,289\nImporte : 20,00\nB. Imp. : 16,53\nImp. IVA : 3,47");
  test("se queda con la que cuadra y completa la gasolinera con la otra (foto real del iPhone)", () => {
    expect(normal.litros).toBeNull();
    const d = mejorLectura([normal, umbral]);
    expect(d).toMatchObject({ litros: 15.52, precio_litro: 1.289, importe: 20, gasolinera: "PLENERGY GRUPO, S.L.", factura: "039R2400065003", base_imponible: 16.53, iva_importe: 3.47 });
    expect(mejorLectura([umbral, normal]).litros).toBe(15.52);
  });
  test("completa: cuadra, fecha, CIF y base imponible", () => {
    expect(lecturaCompleta(umbral)).toBe(true);
    expect(lecturaCompleta(normal)).toBe(false);
  });
});
