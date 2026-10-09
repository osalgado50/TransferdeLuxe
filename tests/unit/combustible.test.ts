import { expect, test } from "vitest";
import { consumoMedioL100, gastoPorMes, resumenCombustible } from "@/lib/dominio/combustible";

const t = (fecha: string, litros: number, importe: number, km: number) => ({ vehiculoId: "v1", fecha, litros, importe, km });

test("resumen suma gasto y litros con 2 decimales", () => {
  expect(resumenCombustible([t("2026-10-01", 40.5, 60.1, 1000), t("2026-10-05", 30.25, 45.333, 1500)]))
    .toEqual({ gasto: 105.43, litros: 70.75, tickets: 2 });
});
test("consumo: litros posteriores al primero / km recorridos", () => {
  // Tanque lleno en 1000 km; luego 35 L a los 1500 y 40 L a los 2000 → 75 L / 1000 km = 7.5
  expect(consumoMedioL100([t("2026-10-09", 40, 60, 2000), t("2026-10-01", 50, 75, 1000), t("2026-10-05", 35, 52, 1500)])).toBe(7.5);
});
test("consumo null con un ticket o km no crecientes", () => {
  expect(consumoMedioL100([t("2026-10-01", 40, 60, 1000)])).toBeNull();
  expect(consumoMedioL100([t("2026-10-01", 40, 60, 1000), t("2026-10-02", 40, 60, 1000)])).toBeNull();
});
test("gasto por mes ordenado", () => {
  expect(gastoPorMes([t("2026-10-02", 10, 15, 1), t("2026-09-30", 20, 30, 2), t("2026-10-20", 5, 7.5, 3)])).toEqual([
    { mes: "2026-09", gasto: 30, litros: 20 }, { mes: "2026-10", gasto: 22.5, litros: 15 },
  ]);
});
