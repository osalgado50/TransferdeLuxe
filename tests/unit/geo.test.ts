import { expect, test } from "vitest";
import { distanciaKm, duracionEstimadaMin, diaMadrid } from "@/lib/dominio/geo";

const reusAeropuerto = { lat: 41.1474, lng: 1.1672 };
const salou = { lat: 41.0763, lng: 1.1416 };
const barcelonaAeropuerto = { lat: 41.2974, lng: 2.0833 };

test("distancia Reus aeropuerto – Salou ≈ 8 km", () => {
  expect(distanciaKm(reusAeropuerto, salou)).toBeGreaterThan(7);
  expect(distanciaKm(reusAeropuerto, salou)).toBeLessThan(9);
});
test("duración mínima 15 min y BCN–Salou alrededor de 1 h 20", () => {
  expect(duracionEstimadaMin(salou, salou)).toBe(15);
  const d = duracionEstimadaMin(barcelonaAeropuerto, salou);
  expect(d).toBeGreaterThan(70);
  expect(d).toBeLessThan(100);
});
test("diaMadrid: 23:30 UTC del 18 es el 19 en Madrid (verano CEST)", () => {
  expect(diaMadrid("2026-10-18T22:30:00Z")).toBe("2026-10-19");
  expect(diaMadrid("2026-10-18T21:59:00Z")).toBe("2026-10-18");
});
