import { describe, expect, it } from "vitest";
import { rangosConductor, sumarDias } from "@/lib/dominio/dias";
import { formatoCuenta } from "@/lib/dominio/plazo";

describe("rangosConductor", () => {
  it("hoy, próximos 7 días e historial en hora de Madrid (verano UTC+2)", () => {
    const r = rangosConductor(new Date("2026-10-10T22:30:00Z")); // ya es 11/10 en Madrid
    expect(r.hoy).toEqual({ desde: "2026-10-10T22:00:00.000Z", hasta: "2026-10-11T22:00:00.000Z" });
    expect(r.proximos).toEqual({ desde: "2026-10-11T22:00:00.000Z", hasta: "2026-10-18T22:00:00.000Z" });
    expect(r.historial).toEqual({ desde: "2026-10-04T22:00:00.000Z", desdeDia: "2026-10-05" });
  });
  it("cruza el cambio de hora de octubre", () => {
    const r = rangosConductor(new Date("2026-10-24T10:00:00Z"));
    expect(r.hoy.hasta).toBe("2026-10-24T22:00:00.000Z");
    expect(r.proximos.hasta).toBe("2026-10-31T23:00:00.000Z");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formatoCuenta", () => {
  it("formatea como la web", () => {
    expect(formatoCuenta(59)).toBe("0:59");
    expect(formatoCuenta(3600)).toBe("60:00");
    expect(formatoCuenta(3725)).toBe("1:02:05");
    expect(formatoCuenta(86401)).toBe("Sin límite de respuesta");
  });
});
