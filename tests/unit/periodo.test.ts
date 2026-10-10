import { describe, expect, test } from "vitest";
import { rangoPeriodo, agruparPorDia, contar, diaValido, atajos } from "@/lib/dominio/periodo";

describe("rangoPeriodo", () => {
  test("día normal (CEST)", () => {
    const r = rangoPeriodo("dia", "2026-10-13");
    expect(r.desdeUtc).toBe("2026-10-12T22:00:00.000Z");
    expect(r.hastaUtc).toBe("2026-10-13T22:00:00.000Z");
    expect(r.anterior).toBe("2026-10-12");
    expect(r.siguiente).toBe("2026-10-14");
    expect(r.etiqueta).toMatch(/^Martes/);
  });
  test("semana lunes-domingo desde un miércoles", () => {
    const r = rangoPeriodo("semana", "2026-10-14");
    expect(r.inicio).toBe("2026-10-12");
    expect(r.fin).toBe("2026-10-18");
    expect(r.anterior).toBe("2026-10-05");
    expect(r.siguiente).toBe("2026-10-19");
  });
  test("domingo pertenece a la semana que empieza el lunes anterior", () => {
    expect(rangoPeriodo("semana", "2026-10-18").inicio).toBe("2026-10-12");
  });
  test("semana del cambio de hora (26/10/2026) dura 169 h", () => {
    const r = rangoPeriodo("semana", "2026-10-26");
    expect(r.desdeUtc).toBe("2026-10-25T23:00:00.000Z"); // lunes 26 ya en CET
    const semanaAnterior = rangoPeriodo("semana", "2026-10-25");
    expect(semanaAnterior.inicio).toBe("2026-10-19");
    expect(semanaAnterior.desdeUtc).toBe("2026-10-18T22:00:00.000Z");
    expect(semanaAnterior.hastaUtc).toBe("2026-10-25T23:00:00.000Z");
    expect((Date.parse(semanaAnterior.hastaUtc) - Date.parse(semanaAnterior.desdeUtc)) / 3600e3).toBe(169);
  });
  test("cambio de hora de primavera (29/03/2026): día de 23 h", () => {
    const r = rangoPeriodo("dia", "2026-03-29");
    expect(r.desdeUtc).toBe("2026-03-28T23:00:00.000Z");
    expect(r.hastaUtc).toBe("2026-03-29T22:00:00.000Z");
    expect((Date.parse(r.hastaUtc) - Date.parse(r.desdeUtc)) / 3600e3).toBe(23);
    expect(rangoPeriodo("semana", "2026-03-29").inicio).toBe("2026-03-23");
  });
  test("día 25/10/2026 dura 25 h", () => {
    const r = rangoPeriodo("dia", "2026-10-25");
    expect((Date.parse(r.hastaUtc) - Date.parse(r.desdeUtc)) / 3600e3).toBe(25);
  });
  test("mes: límites y navegación entre años", () => {
    const r = rangoPeriodo("mes", "2026-12-15");
    expect(r.inicio).toBe("2026-12-01");
    expect(r.fin).toBe("2026-12-31");
    expect(r.desdeUtc).toBe("2026-11-30T23:00:00.000Z");
    expect(r.hastaUtc).toBe("2026-12-31T23:00:00.000Z");
    expect(r.siguiente).toBe("2027-01-01");
    expect(r.anterior).toBe("2026-11-01");
    expect(r.etiqueta).toBe("Diciembre de 2026");
  });
  test("mes bisiesto y octubre con cambio de hora", () => {
    expect(rangoPeriodo("mes", "2028-02-10").fin).toBe("2028-02-29");
    const o = rangoPeriodo("mes", "2026-10-31");
    expect(o.desdeUtc).toBe("2026-09-30T22:00:00.000Z");
    expect(o.hastaUtc).toBe("2026-10-31T23:00:00.000Z");
    expect(o.siguiente).toBe("2026-11-01");
  });
});

describe("agruparPorDia", () => {
  test("agrupa por día Madrid, ordena por hora y titula en es-ES", () => {
    const g = agruparPorDia([
      { fecha_hora_recogida: "2026-10-13T10:00:00Z" },
      { fecha_hora_recogida: "2026-10-12T22:30:00Z" }, // 00:30 del 13 en Madrid
      { fecha_hora_recogida: "2026-10-12T08:00:00Z" },
    ]);
    expect(g.map((x) => x.dia)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(g[0].titulo).toBe("Lunes 12/10 · 1 servicio");
    expect(g[1].titulo).toBe("Martes 13/10 · 2 servicios");
    expect(g[1].servicios[0].fecha_hora_recogida).toBe("2026-10-12T22:30:00Z");
  });
  test("vacío", () => expect(agruparPorDia([])).toEqual([]));
});

test("contar", () => {
  const c = contar([
    { estado: "pendiente", subcontratar: true }, { estado: "asignado", subcontratar: false },
    { estado: "aceptado", subcontratar: false }, { estado: "recogido", subcontratar: false },
    { estado: "completado", subcontratar: false }, { estado: "cancelado", subcontratar: true },
  ]);
  expect(c).toEqual({ pendientes: 1, esperando: 1, enCurso: 2, completados: 1, subcontratar: 1, cancelados: 1 });
});

test("diaValido y atajos", () => {
  expect(diaValido("2026-02-31")).toBe(false);
  expect(diaValido("2026-10-13")).toBe(true);
  expect(diaValido("abc")).toBe(false);
  expect(atajos("2026-10-31").pasado.desde).toBe("2026-11-02");
});
