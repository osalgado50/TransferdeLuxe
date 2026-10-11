import { describe, expect, it } from "vitest";
import { normalizarVuelo, calcularNuevaRecogida, urlVuelo, admiteReajuste } from "@/lib/dominio/vuelos";

describe("normalizarVuelo", () => {
  it.each([["fr 1234", "FR1234"], ["vy-8120", "VY8120"], ["W94412", "W94412"], ["vlg8120", "VLG8120"], ["U2 1", "U21"], ["3k123", "3K123"]])("%s → %s", (a, b) => {
    expect(normalizarVuelo(a)).toBe(b);
  });
  it.each(["", null, "1234", "F1234X", "FR12345", "ABCD12", "FR", "12345"])("rechaza %s", (v) => {
    expect(normalizarVuelo(v)).toBeNull();
  });
});

describe("urlVuelo", () => {
  it("apunta a flightradar24", () => expect(urlVuelo("FR1234")).toBe("https://www.flightradar24.com/data/flights/fr1234"));
});

describe("calcularNuevaRecogida", () => {
  const actual = new Date("2026-10-12T10:00:00Z");
  it("llegada + 20 min por defecto", () => {
    expect(calcularNuevaRecogida({ llegadaReal: new Date("2026-10-12T10:25:00Z"), recogidaActual: actual, estado: "aceptado" })?.toISOString()).toBe("2026-10-12T10:45:00.000Z");
  });
  it("respeta el margen configurado y adelanta si el vuelo llega antes", () => {
    expect(calcularNuevaRecogida({ llegadaReal: new Date("2026-10-12T09:00:00Z"), margenMin: 30, recogidaActual: actual, estado: "pendiente" })?.toISOString()).toBe("2026-10-12T09:30:00.000Z");
  });
  it("margen inválido usa 20", () => {
    expect(calcularNuevaRecogida({ llegadaReal: new Date("2026-10-12T09:00:00Z"), margenMin: -5, recogidaActual: actual, estado: "asignado" })?.toISOString()).toBe("2026-10-12T09:20:00.000Z");
  });
  it("null si no cambia o el servicio está cerrado", () => {
    expect(calcularNuevaRecogida({ llegadaReal: new Date("2026-10-12T09:40:00Z"), recogidaActual: actual, estado: "aceptado" })).toBeNull();
    expect(calcularNuevaRecogida({ llegadaReal: new Date("2026-10-12T11:00:00Z"), recogidaActual: actual, estado: "completado" })).toBeNull();
    expect(admiteReajuste("en_camino")).toBe(true);
    expect(admiteReajuste("cancelado")).toBe(false);
  });
});
