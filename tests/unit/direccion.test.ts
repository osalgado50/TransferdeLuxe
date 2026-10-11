import { describe, expect, it } from "vitest";
import { direccionCorta, urlNavegacion } from "@/lib/dominio/direccion";

describe("direccionCorta", () => {
  it("quita país, comunidad, comarca, CP y provincia repetida", () => {
    const d = direccionCorta("Carrer de Florenci Vives, Part Alta, Tarragona, Tarragonés, Tarragona, Cataluña, 43002, España");
    expect(d.principal).toBe("Carrer de Florenci Vives, Part Alta");
    expect(d.localidad).toBe("Tarragona");
  });
  it("la localidad es la ciudad, no la provincia", () => {
    const d = direccionCorta("Hospital, Avinguda de Bellissens, Sant Josep Obrer, Mas Abelló, Reus, Bajo Campo, Tarragona, Cataluña, 43204, España");
    expect(d.principal).toBe("Hospital, Avinguda de Bellissens");
    expect(d.localidad).toBe("Reus");
  });
  it("nombres cortos de lugares frecuentes se quedan igual", () => {
    expect(direccionCorta("Aeropuerto de Reus")).toMatchObject({ principal: "Aeropuerto de Reus", localidad: null });
    expect(direccionCorta("Salou – Plaza Europa").principal).toBe("Salou – Plaza Europa");
  });
  it("dos partes: calle y localidad", () => {
    expect(direccionCorta("Avinguda Carles Buïgas, Salou")).toMatchObject({ principal: "Avinguda Carles Buïgas", localidad: "Salou" });
  });
});
describe("urlNavegacion", () => {
  it("usa coordenadas si existen y el texto si no", () => {
    expect(urlNavegacion("X", 41.1, 1.2)).toContain("destination=41.1,1.2");
    expect(urlNavegacion("Aeropuerto de Reus")).toContain("destination=Aeropuerto%20de%20Reus");
  });
});
