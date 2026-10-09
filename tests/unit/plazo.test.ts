import { expect, test } from "vitest";
import { segundosRestantes } from "@/lib/dominio/plazo";
test("cuenta atrás", () => {
  const a = "2026-10-15T10:00:00Z";
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:05:00Z"))).toBe(600);
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:20:00Z"))).toBe(0);
});

import { claveAsignacion } from "@/lib/dominio/plazo";
test("clave de asignación independiente del formato de fecha", () => {
  const a = claveAsignacion({ id: "x", asignado_en: "2026-10-10T08:00:00.120Z" });
  expect(claveAsignacion({ id: "x", asignado_en: "2026-10-10 08:00:00.12+00" })).toBe(a);
  expect(claveAsignacion({ id: "x", asignado_en: null })).toBe("x|");
});
