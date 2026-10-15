import { expect, test } from "vitest";
import { acotarFilas, esServicioDePrueba } from "@/lib/dominio/filasEnVivo";

const ahora = Date.parse("2026-10-16T12:00:00Z");
const hace = (h: number) => new Date(ahora - h * 3600e3).toISOString();
const fila = (id: number, h: number, grave = false) => ({ id, en: hace(h), grave });
const op = { fecha: (f: { en: string }) => f.en, max: 5, horas: 24, ahora, conservar: (f: { grave: boolean }) => f.grave };

test("pruebas automáticas: es_prueba o notas «PRUEBA AUTOMÁTICA…»", () => {
  expect(esServicioDePrueba({ es_prueba: true })).toBe(true);
  expect(esServicioDePrueba({ es_prueba: false, notas: "PRUEBA AUTOMÁTICA 3" })).toBe(true);
  expect(esServicioDePrueba({ es_prueba: false, notas: "Silla de bebé" })).toBe(false);
  expect(esServicioDePrueba({})).toBe(false);
});

test("acotar: por debajo del máximo, la misma lista (sin repintar)", () => {
  const xs = [fila(1, 48), fila(2, 1)];
  expect(acotarFilas(xs, op)).toBe(xs);
});

test("acotar: por encima, fuera lo de hace > 24 h salvo lo conservado; y luego las más antiguas", () => {
  const xs = [fila(1, 48), fila(2, 30, true), fila(3, 20), fila(4, 10), fila(5, 5), fila(6, 2), fila(7, 1)];
  expect(acotarFilas(xs, op).map((f) => f.id)).toEqual([2, 4, 5, 6, 7]);
  // Todo reciente: se quedan las 5 más nuevas (la conservada, siempre).
  const ys = [fila(1, 9, true), fila(2, 8), fila(3, 7), fila(4, 6), fila(5, 5), fila(6, 4), fila(7, 3)];
  expect(acotarFilas(ys, op).map((f) => f.id)).toEqual([1, 4, 5, 6, 7]);
});
