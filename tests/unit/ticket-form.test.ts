import { expect, test } from "vitest";
import { esquemaTicket, fueCorregido } from "@/app/conductor/ticket/esquema";

test("valida ticket y convierte comas", () => {
  const r = esquemaTicket.parse({ fecha: "2026-10-09", gasolinera: "Estación Demo", litros: "42,15", precio_litro: "1,459", importe: "61,50", tipo_combustible: "Diésel", km: "123456", foto_path: "c1/x.jpg", datos_ia: "{}" });
  expect(r.litros).toBe(42.15);
  expect(r.importe).toBe(61.5);
  expect(esquemaTicket.safeParse({ fecha: "2026-10-09", litros: "0", importe: "10", km: "1" }).success).toBe(false);
});

test("fueCorregido compara con lo leído", () => {
  const ia = { fecha: "2026-10-09", gasolinera: null, litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" as const };
  expect(fueCorregido(ia, { fecha: "2026-10-09", litros: 42.15, precio_litro: 1.459, importe: 61.5 })).toBe(false);
  expect(fueCorregido(ia, { fecha: "2026-10-09", litros: 40, precio_litro: 1.459, importe: 61.5 })).toBe(true);
});

import { fotoPathValida } from "@/app/conductor/ticket/esquema";
const C = "11111111-2222-3333-4444-555555555555";
const U = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
test("fotoPathValida", () => {
  expect(fotoPathValida(`${C}/${U}.jpeg`, C)).toBe(true);
  expect(fotoPathValida(`99999999-2222-3333-4444-555555555555/${U}.jpeg`, C)).toBe(false);
  expect(fotoPathValida(`${C}/../x/${U}.jpeg`, C)).toBe(false);
  expect(fotoPathValida("", C)).toBe(false);
});
test("km vacío, fecha imposible o futura fallan", () => {
  const base = { fecha: "2026-10-09", litros: "1", importe: "1", km: "5" };
  expect(esquemaTicket.safeParse({ ...base, km: "" }).success).toBe(false);
  expect(esquemaTicket.safeParse({ ...base, fecha: "2026-02-31" }).success).toBe(false);
  expect(esquemaTicket.safeParse({ ...base, fecha: "2999-01-01" }).success).toBe(false);
});
