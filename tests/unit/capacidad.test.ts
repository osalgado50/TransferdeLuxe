import { expect, test } from "vitest";
import { cabeEnTipo, tipoMinimo, vehiculosAptos, avisoCapacidad } from "@/lib/dominio/capacidad";

test("cabeEnTipo respeta pasajeros y maletas", () => {
  expect(cabeEnTipo("sedan", 3, 3)).toBe(true);
  expect(cabeEnTipo("sedan", 4, 0)).toBe(false);
  expect(cabeEnTipo("sedan", 2, 4)).toBe(false);
});
test("tipoMinimo elige el más pequeño o null", () => {
  expect(tipoMinimo(5, 6)).toBe("minivan");
  expect(tipoMinimo(8, 8)).toBe("minivan_premium");
  expect(tipoMinimo(1, 0)).toBe("sedan");
  expect(tipoMinimo(14, 0)).toBe("minibus");
  expect(tipoMinimo(20, 0)).toBeNull();
  expect(tipoMinimo(2, 20)).toBeNull();
});
test("vehiculosAptos filtra taller, plazas y maletas", () => {
  const v = [
    { plazas: 8, maletas: 8, estado: "activo" as const }, { plazas: 8, maletas: 2, estado: "activo" as const },
    { plazas: 8, maletas: 8, estado: "taller" as const }, { plazas: 4, maletas: 8, estado: "activo" as const },
  ];
  expect(vehiculosAptos(v, 5, 6)).toEqual([v[0]]);
  expect(vehiculosAptos(v, 9, 0)).toEqual([]);
});
test("avisoCapacidad sugiere el mínimo", () => {
  expect(avisoCapacidad("minivan", 5, 6)).toBeNull();
  const a = avisoCapacidad("sedan", 5, 6)!;
  expect(a.sugerido).toBe("minivan");
  expect(a.mensaje).toBe("Un Sedán lleva 3 pasajeros y 3 maletas; para 5 pasajeros y 6 maletas elige MiniVan (7 pax)");
  expect(avisoCapacidad("minibus", 10, 25)!.sugerido).toBeNull();
});
