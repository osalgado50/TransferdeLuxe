import { expect, test } from "vitest";
import { esquemaTicket, fueCorregido } from "@/app/conductor/ticket/esquema";

test("valida ticket y convierte comas", () => {
  const r = esquemaTicket.parse({ fecha: "2026-10-12", gasolinera: "Estación Demo", litros: "42,15", precio_litro: "1,459", importe: "61,50", tipo_combustible: "Diésel", km: "123456", foto_path: "c1/x.jpg", datos_ia: "{}" });
  expect(r.litros).toBe(42.15);
  expect(r.importe).toBe(61.5);
  expect(esquemaTicket.safeParse({ fecha: "2026-10-12", litros: "0", importe: "10", km: "1" }).success).toBe(false);
});

test("fueCorregido compara con lo leído", () => {
  const ia = { fecha: "2026-10-12", gasolinera: null, litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" as const };
  expect(fueCorregido(ia, { fecha: "2026-10-12", litros: 42.15, precio_litro: 1.459, importe: 61.5 })).toBe(false);
  expect(fueCorregido(ia, { fecha: "2026-10-12", litros: 40, precio_litro: 1.459, importe: 61.5 })).toBe(true);
});
