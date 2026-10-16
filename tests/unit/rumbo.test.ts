import { expect, test } from "vitest";
import { difAngulo, prepararRuta, puntoEnRecorrido, rumbo, rumboCoche, rumboRutaEn, siguienteGiro, situarEnRuta, zoomNavegacion } from "@/lib/dominio/rumbo";

// Ruta de prueba en Salou: 1 km hacia el norte y luego 600 m hacia el este (un giro a la derecha).
const base = { lat: 41.07, lng: 1.13 };
const norte = (mts: number) => ({ lat: base.lat + mts / 111_000, lng: base.lng });
const esquina = norte(1000);
const este = (mts: number) => ({ lat: esquina.lat, lng: esquina.lng + mts / (111_000 * Math.cos((esquina.lat * Math.PI) / 180)) });
const coords: [number, number][] = [base, norte(300), norte(700), esquina, este(300), este(600)].map((p) => [p.lat, p.lng]);
const r = prepararRuta(coords);

test("rumbo y giro con signo", () => {
  expect(Math.round(rumbo(base, norte(100)))).toBe(0);
  expect(Math.round(rumbo(esquina, este(100)))).toBe(90);
  expect(difAngulo(350, 10)).toBe(20); // a la derecha cruzando el norte
  expect(difAngulo(10, 350)).toBe(-20);
});

test("situarse en la ruta y moverse por ella", () => {
  expect(r.total).toBeGreaterThan(1590);
  expect(r.total).toBeLessThan(1610);
  const p = situarEnRuta(r, { lat: norte(500).lat, lng: base.lng + 0.0002 }); // a ~17 m de la calle
  expect(Math.round(p.s / 10) * 10).toBe(500);
  expect(p.desvioM).toBeGreaterThan(10);
  expect(p.desvioM).toBeLessThan(25);
  expect(Math.round(rumboRutaEn(r, 500)!)).toBe(0);
  expect(Math.round(rumboRutaEn(r, 1200)!)).toBe(90);
  expect(puntoEnRecorrido(r, 0)).toEqual(base);
});

test("siguiente giro: la esquina a la derecha, y nada en una recta", () => {
  const g = siguienteGiro(r, 600)!;
  expect(g.distanciaM).toBeGreaterThan(360);
  expect(g.distanciaM).toBeLessThan(420); // la esquina está a 400 m
  expect(g.angulo).toBeGreaterThan(40); // a la derecha
  expect(siguienteGiro(r, 0, { alcanceM: 500 })).toBeNull(); // 500 m de recta por delante
  expect(siguienteGiro(r, 1100)).toBeNull(); // ya pasado
});

test("rumbo del coche: GPS en marcha; despacio, el de la ruta; fuera de ella, el anterior", () => {
  expect(rumboCoche({ gps: 85, velocidadMs: 10, ruta: 90, desvioM: 5, anterior: 0 })).toBe(85);
  expect(rumboCoche({ gps: 200, velocidadMs: 0.5, ruta: 90, desvioM: 5, anterior: 0 })).toBe(90);
  expect(rumboCoche({ gps: -1, velocidadMs: 12, ruta: 90, desvioM: 5, anterior: 0 })).toBe(90);
  expect(rumboCoche({ gps: 200, velocidadMs: 0.5, ruta: 90, desvioM: 120, anterior: 45 })).toBe(45);
});

test("zoom: más lejos en autovía, de cerca al llegar a un cruce", () => {
  expect(zoomNavegacion({ velocidadKmh: 110, giroM: null })).toBeLessThan(zoomNavegacion({ velocidadKmh: 30, giroM: null }));
  expect(zoomNavegacion({ velocidadKmh: 40, giroM: 100 })).toBeCloseTo(17.3);
  expect(zoomNavegacion({ velocidadKmh: 40, giroM: 600 })).toBe(16);
  // A 100 km/h el aviso empieza antes (~400 m).
  expect(zoomNavegacion({ velocidadKmh: 100, giroM: 380 })).toBeCloseTo(17.3);
  expect(zoomNavegacion({ velocidadKmh: null, giroM: null })).toBe(16.4);
});
