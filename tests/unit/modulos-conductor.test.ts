import { describe, expect, it } from "vitest";
import { accionValida, csvRegistro, estadoJornada, formatoDuracion, lunesDe, msTrabajados, registroPorDia, resumenConductor, type Jornada } from "@/lib/dominio/jornada";
import { validarIncidencia } from "@/lib/dominio/incidencias";
import { debePedirChecklist, fallos, reordenar, validarRespuestas, type ItemChecklist } from "@/lib/dominio/checklist";

const J = (inicio: string, fin: string | null, pausas: { inicio: string; fin: string | null }[] = [], c = "c1"): Jornada =>
  ({ id: inicio, conductor_id: c, inicio, fin, pausas });

describe("jornada", () => {
  it("estados y transiciones", () => {
    expect(estadoJornada(null)).toBe("fuera");
    expect(estadoJornada(J("2026-10-12T06:00:00Z", null))).toBe("trabajando");
    expect(estadoJornada(J("2026-10-12T06:00:00Z", null, [{ inicio: "2026-10-12T08:00:00Z", fin: null }]))).toBe("en_pausa");
    expect(accionValida("fuera", "iniciar")).toBe(true);
    expect(accionValida("fuera", "pausa")).toBe(false);
    expect(accionValida("en_pausa", "reanudar")).toBe(true);
    expect(accionValida("trabajando", "reanudar")).toBe(false);
  });
  it("horas trabajadas descuentan pausas y recortan al rango", () => {
    const j = J("2026-10-12T06:00:00Z", "2026-10-12T14:00:00Z", [{ inicio: "2026-10-12T10:00:00Z", fin: "2026-10-12T10:30:00Z" }]);
    const d = Date.parse("2026-10-12T00:00:00Z"), h = Date.parse("2026-10-13T00:00:00Z");
    expect(msTrabajados([j], d, h, h)).toBe(7.5 * 3600e3);
    expect(msTrabajados([j], Date.parse("2026-10-12T12:00:00Z"), h, h)).toBe(2 * 3600e3);
  });
  it("jornada y pausa abiertas cuentan hasta ahora", () => {
    const ahora = new Date("2026-10-12T09:00:00Z");
    const r = resumenConductor([J("2026-10-12T06:00:00Z", null, [{ inicio: "2026-10-12T08:00:00Z", fin: null }])], ahora);
    expect(r.estado).toBe("en_pausa");
    expect(r.msHoy).toBe(2 * 3600e3);
    expect(formatoDuracion(r.msSemana)).toBe("2 h 00 min");
  });
  it("lunes de la semana", () => {
    expect(lunesDe("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(lunesDe("2026-10-12")).toBe("2026-10-12");
  });
  it("registro por día y CSV", () => {
    const ahora = new Date("2026-10-13T00:00:00Z");
    const filas = registroPorDia([
      J("2026-10-12T06:00:00Z", "2026-10-12T10:00:00Z"),
      J("2026-10-12T12:00:00Z", "2026-10-12T15:00:00Z", [{ inicio: "2026-10-12T13:00:00Z", fin: "2026-10-12T13:15:00Z" }]),
    ], ahora);
    expect(filas).toHaveLength(1);
    expect(filas[0].msTrabajado).toBe(6.75 * 3600e3);
    expect(filas[0].pausas).toBe(1);
    expect(filas[0].salida).toBe("2026-10-12T15:00:00Z");
    const csv = csvRegistro(filas, () => "Conductor; Demo");
    expect(csv).toContain('"Conductor; Demo";2026-10-12;08:00;17:00;1;0,25;6,75;No');
  });
});

describe("incidencias", () => {
  const yo = "11111111-1111-1111-1111-111111111111";
  it("valida tipo, descripción y foto del propio conductor", () => {
    expect(validarIncidencia({ tipo: "xx" }, yo).ok).toBe(false);
    expect(validarIncidencia({ tipo: "otro", descripcion: " " }, yo).ok).toBe(false);
    const r = validarIncidencia({ tipo: "retraso", lat: 40, lng: 999 }, yo);
    expect(r.ok && r.datos.lat).toBe(null);
    expect(validarIncidencia({ tipo: "averia", foto_path: `otro/${yo}.jpg` }, yo).ok).toBe(false);
    expect(validarIncidencia({ tipo: "averia", foto_path: `${yo}/${yo}.jpg` }, yo).ok).toBe(true);
  });
});

describe("checklist", () => {
  const items: ItemChecklist[] = [
    { id: "a", texto: "Luces", orden: 2, activo: true },
    { id: "b", texto: "Neumáticos", orden: 1, activo: true },
    { id: "c", texto: "Viejo", orden: 3, activo: false },
  ];
  it("exige todos los activos y detecta fallos", () => {
    expect(validarRespuestas({ a: "ok" }, items).ok).toBe(false);
    const r = validarRespuestas({ a: "mal", b: "ok", c: "mal", z: "ok" }, items);
    expect(r.ok && r.conFallos).toBe(true);
    expect(r.ok && Object.keys(r.respuestas).sort()).toEqual(["a", "b"]);
    expect(fallos({ a: "mal", b: "ok" }, items)).toEqual(["Luces"]);
  });
  it("cuándo pedirlo", () => {
    const base = { hecho: false, jornadaActiva: true, jornadaAbierta: false, hayVehiculo: true, hayItems: true };
    expect(debePedirChecklist(base)).toBe(false);
    expect(debePedirChecklist({ ...base, jornadaAbierta: true })).toBe(true);
    expect(debePedirChecklist({ ...base, jornadaActiva: false })).toBe(true);
    expect(debePedirChecklist({ ...base, jornadaActiva: false, hecho: true })).toBe(false);
  });
  it("reordenar", () => {
    expect(reordenar(items, "a", -1)).toEqual([{ id: "a", orden: 1 }, { id: "b", orden: 2 }, { id: "c", orden: 3 }]);
    expect(reordenar(items, "b", -1)[0]).toEqual({ id: "b", orden: 1 });
  });
});

import { errorMomentoCentral } from "@/lib/dominio/jornada";
describe("jornada empezada o terminada por la central", () => {
  const ahora = Date.parse("2026-10-17T20:00:00Z");
  const abierta = { id: "j", conductor_id: "c", inicio: "2026-10-17T06:00:00Z", fin: null, pausas: [{ inicio: "2026-10-17T11:00:00Z", fin: null }] };
  it("empezar: no en el futuro, ni con otra abierta, ni más de 48 h atrás, ni antes de que acabara la anterior", () => {
    expect(errorMomentoCentral({ accion: "iniciar", momento: ahora - 3600e3, ahora, abierta: null, ultimaFin: "2026-10-16T17:00:00Z" })).toBeNull();
    expect(errorMomentoCentral({ accion: "iniciar", momento: ahora + 3600e3, ahora, abierta: null, ultimaFin: null })).toMatch(/futuro/);
    expect(errorMomentoCentral({ accion: "iniciar", momento: ahora, ahora, abierta, ultimaFin: null })).toMatch(/Ya tiene una jornada abierta/);
    expect(errorMomentoCentral({ accion: "iniciar", momento: ahora - 49 * 3600e3, ahora, abierta: null, ultimaFin: null })).toMatch(/48 h/);
    expect(errorMomentoCentral({ accion: "iniciar", momento: Date.parse("2026-10-16T16:00:00Z"), ahora, abierta: null, ultimaFin: "2026-10-16T17:00:00Z" })).toMatch(/anterior terminó/);
  });
  it("terminar: con jornada abierta, no antes de su inicio ni de la pausa en curso", () => {
    expect(errorMomentoCentral({ accion: "finalizar", momento: Date.parse("2026-10-17T16:00:00Z"), ahora, abierta, ultimaFin: null })).toBeNull();
    expect(errorMomentoCentral({ accion: "finalizar", momento: ahora, ahora, abierta: null, ultimaFin: null })).toMatch(/ninguna jornada abierta/);
    expect(errorMomentoCentral({ accion: "finalizar", momento: Date.parse("2026-10-17T05:00:00Z"), ahora, abierta, ultimaFin: null })).toMatch(/empezó/);
    expect(errorMomentoCentral({ accion: "finalizar", momento: Date.parse("2026-10-17T10:00:00Z"), ahora, abierta, ultimaFin: null })).toMatch(/pausa/);
  });
  it("el registro marca el día si la central empezó o terminó alguna jornada", () => {
    const f = registroPorDia([{ id: "1", conductor_id: "c", inicio: "2026-10-12T06:00:00Z", fin: "2026-10-12T15:00:00Z", pausas: [], fin_por: "op" }], new Date("2026-10-13T00:00:00Z"));
    expect(f[0].porCentral).toBe(true);
  });
});
