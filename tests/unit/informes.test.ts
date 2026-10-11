import { expect, test } from "vitest";
import { aCsv, agrupar, filtrar, kmEstimados, mesMadrid, serviciosPorDia, totales, type ServicioInforme } from "@/lib/dominio/informes";

const s = (o: Partial<ServicioInforme>): ServicioInforme => ({ id: "s", estado: "completado", pasajeros: 2, conductor_id: "c1", vehiculo_id: "v1",
  fecha_hora_recogida: "2026-10-05T10:00:00Z", origen_lat: 39.57, origen_lng: 2.65, destino_lat: 39.55, destino_lng: 2.74, ...o });

test("km estimados con coordenadas y null sin ellas", () => {
  expect(kmEstimados(s({}))).toBeGreaterThan(9);
  expect(kmEstimados(s({ destino_lat: null }))).toBeNull();
});
test("mesMadrid respeta la zona horaria", () => {
  expect(mesMadrid("2026-09-30T23:30:00Z")).toBe("2026-10");
  expect(mesMadrid("2026-10-05")).toBe("2026-10");
});
test("filtrar por mes y conductor", () => {
  const xs = [s({ id: "a" }), s({ id: "b", conductor_id: "c2" }), s({ id: "c", fecha_hora_recogida: "2026-11-02T10:00:00Z" })];
  expect(filtrar(xs, { mes: "2026-10", conductor: "c1" }, (x) => x.fecha_hora_recogida).map((x) => x.id)).toEqual(["a"]);
});
test("agrupar por vehículo y conductor", () => {
  const e = {
    servicios: [s({}), s({ pasajeros: 3, destino_lat: null }), s({ estado: "cancelado" })],
    tickets: [{ vehiculoId: "v1", conductor_id: "c1", fecha: "2026-10-01", litros: 40, importe: 60, km: 1000 },
      { vehiculoId: "v1", conductor_id: "c1", fecha: "2026-10-09", litros: 30, importe: 45, km: 1500 }],
    rechazos: [{ conductor_id: "c1" }], incidencias: [{ conductor_id: "c1", vehiculo_id: null }],
  };
  const [v] = agrupar(e, "vehiculo");
  expect(v).toMatchObject({ id: "v1", servicios: 2, pasajeros: 5, sinCoordenadas: 1, litros: 70, gasto: 105, l100: 6, rechazos: 0 });
  const [c] = agrupar(e, "conductor");
  expect(c).toMatchObject({ id: "c1", rechazos: 1, incidencias: 1, l100: null });
  expect(totales([v]).servicios).toBe(2);
});
test("servicios por día", () => {
  const d = serviciosPorDia([s({}), s({ fecha_hora_recogida: "2026-10-05T20:00:00Z" })], "2026-10");
  expect(d).toHaveLength(31);
  expect(d[4].servicios).toBe(2);
});
test("CSV con ; y escapado", () => {
  expect(aCsv(["a", "b"], [["x;y", 1], [null, 'di"jo']])).toBe('﻿a;b\r\n"x;y";1\r\n;"di""jo"\r\n');
});
