import { describe, expect, it } from "vitest";
import { conexionConductor } from "@/lib/dominio/conexionConductor";

const ahora = new Date("2026-10-11T12:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
describe("conexionConductor", () => {
  it("en línea con GPS activo y posición reciente", () => {
    expect(conexionConductor({ en_servicio: true, registrado_en: hace(0.2) }, ahora, 5)).toMatchObject({ estado: "en_linea", texto: "En línea · GPS ahora" });
  });
  it("sin señal si pasa el umbral con el GPS encendido", () => {
    expect(conexionConductor({ en_servicio: true, registrado_en: hace(12) }, ahora, 5)).toMatchObject({ estado: "sin_senal", minutos: 12 });
  });
  it("fuera de servicio o sin GPS nunca", () => {
    expect(conexionConductor({ en_servicio: false, registrado_en: hace(90) }, ahora, 5).estado).toBe("fuera");
    expect(conexionConductor(undefined, ahora, 5).estado).toBe("fuera");
  });
});
