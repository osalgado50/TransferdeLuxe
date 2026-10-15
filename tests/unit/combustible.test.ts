import { expect, test } from "vitest";
import { ticketsParaConsumo, consumoMedioL100, gastoPorMes, resumenCombustible } from "@/lib/dominio/combustible";

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

test("ticketsParaConsumo: sin mes devuelve todos; con mes corta al final de ese mes", () => {
  const ts = [t("2026-08-30", 1, 1, 1), t("2026-09-10", 1, 1, 2), t("2026-10-02", 1, 1, 3)];
  expect(ticketsParaConsumo(ts)).toHaveLength(3);
  expect(ticketsParaConsumo(ts, { mes: "2026-09" }).map((x) => x.km)).toEqual([1, 2]);
});

import { previoAlMes, tramosConsumo } from "@/lib/dominio/combustible";

test("consumo absurdo: un ticket atrasado o mal leído (más km y fecha vieja) no hunde la media", () => {
  // Caso real del informe: 2 tickets de 2024 con 125.800 km y los buenos de 2026 entre 119.000 y 120.150.
  const ts = [t("2024-04-25", 10.59, 20, 125800), t("2024-04-25", 15.52, 20, 125800),
    t("2026-09-05", 45, 65.21, 119000), t("2026-09-24", 33, 48.15, 119500), t("2026-10-08", 42.15, 61.5, 120150)];
  // Antes (ordenado por km): (33 + 42,15 + 10,59 + 15,52) / 6.800 km = 1,5 L/100 km.
  // Ahora por fecha: 2024→2026 baja los km (descartado); 119.000→119.500: 6,6; 119.500→120.150: 6,5.
  expect(tramosConsumo(ts).map((x) => Math.round(x.l100 * 10) / 10)).toEqual([6.6, 6.5]);
  expect(consumoMedioL100(ts)).toBe(6.5);
});
test("consumo: se descartan tramos imposibles (< 3 o > 30 L/100 km)", () => {
  // 1000 → 50000 km (cuentakilómetros mal escrito): 40 L / 49.000 km = 0,08 → fuera; 50000 → 50500: negativo no, 500 km 35 L = 7.
  const ts = [t("2026-10-01", 50, 75, 1000), t("2026-10-05", 40, 60, 50000), t("2026-10-09", 35, 52, 50500)];
  expect(consumoMedioL100(ts)).toBe(7);
  // 5 L en 10 km = 50 L/100 km → fuera: sin tramos válidos.
  expect(consumoMedioL100([t("2026-10-01", 50, 75, 1000), t("2026-10-02", 5, 7, 1010)])).toBeNull();
});
test("consumo: el anterior es el de fecha anterior (mismo día, por km)", () => {
  const ts = [t("2026-10-02", 30, 45, 1400), t("2026-10-01", 50, 75, 1000), t("2026-10-02", 20, 30, 1200)];
  // 1000 → 1200 (20 L): 10; 1200 → 1400 (30 L): 15 → 50 L / 400 km = 12,5
  expect(consumoMedioL100(ts)).toBe(12.5);
});
test("consumo con filtro: solo los tramos que acaban en el mes, partiendo del ticket anterior", () => {
  const ts = [t("2026-08-20", 40, 60, 1000), t("2026-09-10", 35, 52, 1500), t("2026-09-25", 40, 60, 2000), t("2026-10-05", 30, 45, 2500)];
  expect(consumoMedioL100(ts, (x) => x.fecha.startsWith("2026-09"))).toBe(7.5);
  expect(consumoMedioL100(ts, (x) => x.fecha.startsWith("2026-10"))).toBe(6);
});
test("previoAlMes: el último por fecha antes del mes, no el de más km", () => {
  const ts = [t("2024-04-25", 1, 1, 125800), t("2026-09-24", 1, 1, 119500), t("2026-09-05", 1, 1, 119000), t("2026-10-08", 1, 1, 120150)];
  expect(previoAlMes(ts, "2026-10")?.km).toBe(119500);
  expect(previoAlMes(ts, "2024-04")).toBeUndefined();
});

import { mesesEntre } from "@/lib/dominio/combustible";
test("mesesEntre: del más reciente al más antiguo, cruzando el año", () => {
  expect(mesesEntre("2025-11", "2026-02")).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  expect(mesesEntre("2026-10", "2026-10")).toEqual(["2026-10"]);
  expect(mesesEntre("2026-11", "2026-10")).toEqual([]);
});
