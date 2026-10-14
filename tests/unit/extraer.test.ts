import { describe, expect, test } from "vitest";
import { extraerDatosTicket } from "@/lib/lector/extraer";

const TICKET_A = `ESTACION DEMO COSTA DORADA
C/ Inventada 1 - 43840 SALOU
FACTURA SIMPLIFICADA
Fecha: 12/10/2026 Hora: 08:45
Surtidor 3 DIESEL A
Litros 42,15 L
Precio 1,459 EUR/L
TOTAL 61,50 EUR
Tarjeta ****0000`;

const TICKET_B = `GASOLINERA DEMO NORTE
12-10-26 19:02
GASOLEO A
VOLUMEN: 30.00 LTS
PRECIO/L: 1.500
SUBTOTAL 45.00
IMPORTE TOTAL: 45.00 €`;

const TICKET_C = `ESTACION DEMO SUR
SIN PLOMO 95
05/10/2026
IMPORTE 50,00
LITROS 31,25`;

test("ticket A: todos los campos", () => {
  expect(extraerDatosTicket(TICKET_A)).toEqual({
    fecha: "2026-10-12", gasolinera: "ESTACION DEMO COSTA DORADA", litros: 42.15, precio_litro: 1.459,
    importe: 61.5, tipo_combustible: "Diésel", confianza: "alta", hora: "08:45", nif: null, factura: null,
    base_imponible: null, iva_pct: null, iva_importe: null,
  });
});

test("ticket B: año de dos cifras, puntos decimales, TOTAL frente a SUBTOTAL", () => {
  expect(extraerDatosTicket(TICKET_B)).toMatchObject({
    fecha: "2026-10-12", litros: 30, precio_litro: 1.5, importe: 45, tipo_combustible: "Diésel", confianza: "alta",
  });
});

test("ticket C: calcula el precio por litro que falta y detecta gasolina 95", () => {
  expect(extraerDatosTicket(TICKET_C)).toMatchObject({
    fecha: "2026-10-05", litros: 31.25, precio_litro: 1.6, importe: 50, tipo_combustible: "Gasolina 95", confianza: "alta",
  });
});

test("texto ilegible → todo null y confianza baja", () => {
  expect(extraerDatosTicket("~~ #@! ..")).toEqual({
    fecha: null, gasolinera: null, litros: null, precio_litro: null, importe: null, tipo_combustible: null, confianza: "baja",
    hora: null, nif: null, factura: null, base_imponible: null, iva_pct: null, iva_importe: null,
  });
});

test("fecha imposible se descarta; sin fecha la confianza baja a media", () => {
  const d = extraerDatosTicket("ESTACION X\n31/02/2026\nLITROS 10,00\nTOTAL 15,00");
  expect(d.fecha).toBeNull();
  expect(d.confianza).toBe("media");
  expect(d.precio_litro).toBe(1.5);
});

test("regresión: TOTAL EUR, SUB TOTAL, DIÉSEL, TOTAL IVA, tarjeta y hora", () => {
  const d = extraerDatosTicket(`ESTACION DEMO OESTE
Fecha: 12/10/2026 Hora: 08:45
DIÉSEL A
Litros 42,15 L
Precio 1,459 EUR/L
SUB TOTAL 50,83
TOTAL IVA 10,67
TOTAL EUR 61,50
Tarjeta ****1234`);
  expect(d).toMatchObject({ fecha: "2026-10-12", litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" });
});

test("GASOIL y GASÓLEO se detectan como Diésel", () => {
  expect(extraerDatosTicket("GASOIL\nLITROS 10,00\nTOTAL 15,00").tipo_combustible).toBe("Diésel");
  expect(extraerDatosTicket("GASÓLEO\nLITROS 10,00\nTOTAL 15,00").tipo_combustible).toBe("Diésel");
});

describe("ticket de prepago con ruido del OCR (tesseract en el servidor, app nativa)", () => {
  // Texto tal cual lo devuelve tesseract.js de un ticket de ejemplo de Plenergy (CIF y números de ejemplo públicos).
  const OCR = `PLENERGY GRUPO, S.L.\n\nCIF: B93275394\n\nFecha:[ 25/04/2024 ) 16:55\n\nTurno: 1468\n\nldent. —: w==.........3770\n\nMatricula:\n\n` +
    `Factura simplificada: 039R2400065003\n\nSurtidor : 6\n\nProducto : DIESEL\n\nLitros +: 15,52\n\nPrecio +: 1,289\n\nImporte : 20,00\n\n` +
    `194: 21,07\n\nB. Imp. : 16,53\n\nImp. 108: 3,47\n\nTotal reservado: 20,00 Eur\n\nTotal suninist. + [20,00 Eur`;
  test("lee fecha, hora, gasolinera, CIF, factura, litros, precio, importe, combustible, base e IVA", () => {
    expect(extraerDatosTicket(OCR)).toEqual({
      fecha: "2024-04-25", gasolinera: "PLENERGY GRUPO, S.L.", litros: 15.52, precio_litro: 1.289, importe: 20,
      tipo_combustible: "Diésel", confianza: "alta", hora: "16:55", nif: "B93275394", factura: "039R2400065003",
      // «Imp. 108: 3,47» (IVA mal leído): la cuota sale de importe − base y el 21 % de cuota ÷ base.
      base_imponible: 16.53, iva_pct: 21, iva_importe: 3.47,
    });
  });
  test("datos de factura con la imagen pasada a blanco y negro (texto real del OCR)", () => {
    const umbral = "CIF + 893275394\nFecha:| 25/04/2024 | 16:55\n.2) Factura simplificada: | 039R2400065003\nProducto : DIESEL\n" +
      "Litros : 15,52\nPrecio : 1,289\nImporte : 20,00\nIVA : 21,00 %\nB. Imp. : 16,53\nImp. IVA : 3,47\nTotal suminist. : 20,00 Eur";
    expect(extraerDatosTicket(umbral)).toMatchObject({
      nif: "B93275394", factura: "039R2400065003", hora: "16:55", litros: 15.52, precio_litro: 1.289, importe: 20,
      base_imponible: 16.53, iva_pct: 21, iva_importe: 3.47,
    });
  });
  test("solo el % de IVA: base y cuota se calculan con el importe", () => {
    expect(extraerDatosTicket("REPSOL\nLitros 30\nTotal 60,50\nIVA 21%")).toMatchObject({ base_imponible: 50, iva_pct: 21, iva_importe: 10.5 });
  });
  test("prepago: cuenta lo suministrado, no lo reservado", () => {
    const d = extraerDatosTicket("REPSOL\nLitros: 12,62\nPrecio: 1,459\nTotal reservado: 20,00\nTotal suministrado: 18,41");
    expect(d.importe).toBe(18.41);
    expect(d.gasolinera).toBe("REPSOL");
  });
  test("combustibles con nombre comercial", () => {
    expect(extraerDatosTicket("Producto: SP95\nLitros 10\nTotal 15,00").tipo_combustible).toBe("Gasolina 95");
    expect(extraerDatosTicket("EFITEC 98\nLitros 10\nTotal 17,00").tipo_combustible).toBe("Gasolina 98");
    expect(extraerDatosTicket("Gasoleo A\nLitros 10\nTotal 14,00").tipo_combustible).toBe("Diésel");
  });
});

describe("CIF de la gasolinera con dígito de control", () => {
  test("válidos e inválidos", async () => {
    const { nifValido } = await import("@/lib/lector/extraer");
    expect(nifValido("B93275394")).toBe(true);
    expect(nifValido("B93075394")).toBe(false); // un dígito mal leído
    expect(nifValido("12345678Z")).toBe(true);
    expect(nifValido("12345678A")).toBe(false);
  });
  test("el OCR lee la B como 8 o la etiqueta como «ElF»: se corrige si cuadra el control; si no, nada", () => {
    expect(extraerDatosTicket("CIF + 893275394\nTOTAL 20,00").nif).toBe("B93275394");
    expect(extraerDatosTicket("— ElF : B93275394\nTOTAL 20,00").nif).toBe("B93275394");
    expect(extraerDatosTicket("— ElF + 693075394\nTOTAL 20,00").nif).toBeNull();
  });
  test("ruido delante del nombre de la gasolinera", () => {
    expect(extraerDatosTicket("O PLENERGY GRUPO SL.\nTOTAL 20,00").gasolinera).toBe("PLENERGY GRUPO SL.");
    expect(extraerDatosTicket("— REPSOL CAMBRILS\nTOTAL 20,00").gasolinera).toBe("REPSOL CAMBRILS");
  });
});
