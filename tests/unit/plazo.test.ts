import { expect, test } from "vitest";
import { segundosRestantes } from "@/lib/dominio/plazo";
test("cuenta atrás", () => {
  const a = "2026-10-15T10:00:00Z";
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:05:00Z"))).toBe(600);
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:20:00Z"))).toBe(0);
});
