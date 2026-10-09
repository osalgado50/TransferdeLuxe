import { expect, test } from "vitest";
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
    importe: 61.5, tipo_combustible: "Diésel", confianza: "alta",
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
  });
});

test("fecha imposible se descarta; sin fecha la confianza baja a media", () => {
  const d = extraerDatosTicket("ESTACION X\n31/02/2026\nLITROS 10,00\nTOTAL 15,00");
  expect(d.fecha).toBeNull();
  expect(d.confianza).toBe("media");
  expect(d.precio_litro).toBe(1.5);
});
