import { expect, test } from "vitest";
import { avisosMantenimiento, diasHasta, estadoVehiculo, peor, semaforoFecha, semaforoKm } from "@/lib/dominio/mantenimiento";

const HOY = "2026-10-11";
test("diasHasta", () => {
  expect(diasHasta("2026-10-12", HOY)).toBe(1);
  expect(diasHasta("2026-10-01", HOY)).toBe(-10);
});
test("semáforo por fecha: vencido rojo, <30 días amarillo, resto verde", () => {
  expect(semaforoFecha("2026-10-10", HOY)).toBe("rojo");
  expect(semaforoFecha("2026-10-11", HOY)).toBe("amarillo");
  expect(semaforoFecha("2026-11-09", HOY)).toBe("amarillo");
  expect(semaforoFecha("2026-11-10", HOY)).toBe("verde");
  expect(semaforoFecha(null, HOY)).toBe("sin_datos");
});
test("semáforo por km", () => {
  expect(semaforoKm(100_000, 100_000)).toBe("rojo");
  expect(semaforoKm(100_000, 99_500)).toBe("amarillo");
  expect(semaforoKm(100_000, 99_000)).toBe("verde");
  expect(semaforoKm(null, 5)).toBe("sin_datos");
});
test("peor", () => {
  expect(peor(["verde", "sin_datos", "amarillo"])).toBe("amarillo");
  expect(peor(["sin_datos"])).toBe("sin_datos");
});
test("estado global y avisos", () => {
  const plan = { itv_fecha: "2027-01-01", seguro_vence: "2026-10-01", revision_fecha: null, revision_km: 50_500 };
  const e = estadoVehiculo(plan, 50_000, HOY);
  expect(e.global).toBe("rojo");
  expect(e.items.find((i) => i.clave === "revision_km")?.semaforo).toBe("amarillo");
  expect(estadoVehiculo(null, 0, HOY).global).toBe("sin_datos");
  const av = avisosMantenimiento([{ id: "v", matricula: "0000AAA", km_actuales: 50_000, plan }], HOY);
  expect(av.map((a) => a.clave)).toEqual(["seguro", "revision_km"]);
});
