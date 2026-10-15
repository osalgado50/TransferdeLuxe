import { describe, expect, it } from "vitest";
import { moverActivo } from "@/lib/listaTeclado";

describe("moverActivo (flechas en el desplegable de direcciones)", () => {
  it("sin opciones no hay ninguna activa", () => {
    expect(moverActivo(-1, 0, "ArrowDown")).toBe(-1);
    expect(moverActivo(2, 0, "ArrowUp")).toBe(-1);
  });
  it("flecha abajo empieza por la primera y avanza", () => {
    expect(moverActivo(-1, 3, "ArrowDown")).toBe(0);
    expect(moverActivo(0, 3, "ArrowDown")).toBe(1);
    expect(moverActivo(2, 3, "ArrowDown")).toBe(0);
  });
  it("flecha arriba empieza por la última y retrocede", () => {
    expect(moverActivo(-1, 3, "ArrowUp")).toBe(2);
    expect(moverActivo(2, 3, "ArrowUp")).toBe(1);
    expect(moverActivo(0, 3, "ArrowUp")).toBe(2);
  });
  it("si la lista encoge, un índice fuera de rango se recoloca", () => {
    expect(moverActivo(5, 3, "ArrowDown")).toBe(0);
    expect(moverActivo(5, 3, "ArrowUp")).toBe(2);
  });
});
