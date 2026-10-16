import { expect, test } from "vitest";
import { falloDictado, limpiarDictado } from "@/lib/dominio/dictado";

test("dictado: sin el punto final de Safari, sin espacios de más y con mayúscula inicial", () => {
  expect(limpiarDictado("  avinguda   diagonal 200. ")).toBe("Avinguda diagonal 200");
  expect(limpiarDictado("Aeropuerto de Reus…")).toBe("Aeropuerto de Reus");
  expect(limpiarDictado("plaça d'Europa")).toBe("Plaça d'Europa");
  expect(limpiarDictado("  .  ")).toBe("");
});

test("dictado: errores del navegador → mensaje (pararlo uno mismo no es un error)", () => {
  expect(falloDictado("not-allowed")).toBe("permiso");
  expect(falloDictado("service-not-allowed")).toBe("permiso");
  expect(falloDictado("audio-capture")).toBe("permiso");
  expect(falloDictado("no-speech")).toBe("noOido");
  expect(falloDictado("network")).toBe("otro");
  expect(falloDictado("aborted")).toBeNull();
});
