import { describe, expect, it } from "vitest";
import { leerModulos, modulosDesdeFormulario } from "@/lib/dominio/modulos";

describe("modulos", () => {
  it("ausente o basura = activo; false = inactivo", () => {
    const m = leerModulos({ jornada: false, informes: "x" });
    expect(m.jornada).toBe(false);
    expect(m.informes).toBe(true);
    expect(leerModulos(null).vuelos).toBe(true);
  });
  it("formulario: solo las casillas marcadas quedan activas", () => {
    const m = modulosDesdeFormulario([["mod_vuelos", "on"], ["otro", "on"]]);
    expect(m.vuelos).toBe(true);
    expect(m.jornada).toBe(false);
  });
});
