import { describe, expect, test, vi } from "vitest";
import { parsearRespuesta, esCoherente } from "@/lib/lector/parsear";
import { ClaudeHaikuLector } from "@/lib/lector/claude";

describe("parsearRespuesta", () => {
  test("JSON dentro de bloque de código, números con coma", () => {
    const d = parsearRespuesta('```json\n{"fecha":"2026-10-12","gasolinera":"Estación Demo","litros":"42,15","precio_litro":1.459,"importe":61.5,"tipo_combustible":"Diésel","confianza":"alta"}\n```');
    expect(d).toEqual({ fecha: "2026-10-12", gasolinera: "Estación Demo", litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" });
  });
  test("texto basura → todo null y confianza baja", () => {
    expect(parsearRespuesta("No puedo leer la imagen")).toEqual({
      fecha: null, gasolinera: null, litros: null, precio_litro: null, importe: null, tipo_combustible: null, confianza: "baja" });
  });
  test("fecha inválida se descarta", () => {
    expect(parsearRespuesta('{"fecha":"32/13/2026","litros":10,"importe":15,"confianza":"media"}').fecha).toBeNull();
  });
});

test("esCoherente", () => {
  const base = { fecha: null, gasolinera: null, tipo_combustible: null, confianza: "alta" as const };
  expect(esCoherente({ ...base, litros: 40, precio_litro: 1.5, importe: 60 })).toBe(true);
  expect(esCoherente({ ...base, litros: 40, precio_litro: 1.5, importe: 80 })).toBe(false);
  expect(esCoherente({ ...base, litros: 40, precio_litro: null, importe: 80 })).toBe(true);
});

test("ClaudeHaikuLector envía la imagen al modelo correcto y parsea", async () => {
  const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"litros":10,"importe":15,"precio_litro":1.5,"confianza":"alta"}' }] });
  const lector = new ClaudeHaikuLector({ messages: { create } } as never);
  const d = await lector.leer({ base64: "AAAA", mediaType: "image/jpeg" });
  expect(d.litros).toBe(10);
  const args = create.mock.calls[0][0];
  expect(args.model).toBe("claude-haiku-5-5");
  expect(args.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
});
