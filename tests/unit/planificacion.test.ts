import { describe, expect, test } from "vitest";
import { tiempoTraslado, planDia, encaja, estadoMargen, fmtDuracion, type ServicioPlan } from "@/lib/dominio/planificacion";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";

const reus = { lat: 41.1474, lng: 1.1672 };
const bcn = { lat: 41.2974, lng: 2.0833 };
const salou = { lat: 41.0763, lng: 1.1416 };
const tarragona = { lat: 41.1189, lng: 1.2445 };
const T = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00+02:00`);
const sv = (id: string, ini: string, dur: number, origen: ServicioPlan["origen"], destino: ServicioPlan["destino"], o = "", d = ""): ServicioPlan =>
  ({ id, inicio: T(ini), duracionMin: dur, origen, destino, origenTexto: o || undefined, destinoTexto: d || undefined });

describe("tiempoTraslado", () => {
  test("Reus → Barcelona ≈ 85–95 min", () => {
    const m = tiempoTraslado(reus, bcn)!;
    expect(m).toBeGreaterThanOrEqual(85);
    expect(m).toBeLessThanOrEqual(95);
  });
  test("mismo punto = 0 y sin coordenadas = null", () => {
    expect(tiempoTraslado(salou, salou)).toBe(0);
    expect(tiempoTraslado(null, salou)).toBeNull();
    expect(tiempoTraslado(salou, null)).toBeNull();
  });
});

describe("estadoMargen", () => {
  test("umbrales", () => {
    expect(estadoMargen(-1)).toBe("no_llega");
    expect(estadoMargen(0)).toBe("justo");
    expect(estadoMargen(15)).toBe("justo");
    expect(estadoMargen(16)).toBe("ok");
    expect(estadoMargen(null)).toBe("desconocido");
  });
  test("fmtDuracion", () => {
    expect(fmtDuracion(45)).toBe("45 min");
    expect(fmtDuracion(70)).toBe("1 h 10 min");
    expect(fmtDuracion(120)).toBe("2 h");
  });
});

describe("planDia", () => {
  test("ordena, calcula fines y transiciones", () => {
    const p = planDia([
      sv("b", "13:00", 45, bcn, salou),
      sv("a", "10:00", 60, salou, bcn),
      sv("c", "14:00", 30, null, reus),
    ]);
    expect(p.fines.a).toEqual(T("11:00"));
    expect(p.transiciones.map((t) => [t.anteriorId, t.siguienteId])).toEqual([["a", "b"], ["b", "c"]]);
    expect(p.transiciones[0].trasladoMin).toBe(0);
    expect(p.transiciones[0].margenMin).toBe(120);
    expect(p.transiciones[0].estado).toBe("ok");
    expect(p.transiciones[1].estado).toBe("desconocido");
  });
  test("no llega cuando el traslado supera el hueco", () => {
    const p = planDia([sv("a", "10:00", 60, reus, bcn), sv("b", "11:30", 30, reus, salou)]);
    expect(p.transiciones[0].estado).toBe("no_llega");
    expect(p.transiciones[0].margenMin!).toBeLessThan(0);
  });
});

describe("encaja", () => {
  const agenda = [sv("p", "10:00", 60, salou, bcn, "Salou", "Aeropuerto de Barcelona T1"), sv("n", "18:00", 30, salou, tarragona, "Salou", "Tarragona")];
  test("insertar en medio con tiempo en ambos lados", () => {
    const r = encaja(sv("x", "14:00", 60, bcn, salou, "Aeropuerto de Barcelona T1", "Salou"), agenda);
    expect(r.encaja).toBe(true);
    expect(r.anterior!.siguienteId).toBe("x");
    expect(r.siguiente!.siguienteId).toBe("n");
  });
  test("no llega desde el anterior: razón legible", () => {
    const r = encaja(sv("x", "11:30", 30, reus, salou, "Reus"), agenda);
    expect(r.encaja).toBe(false);
    expect(r.razon).toMatch(/^No llega: termina 11:00 en Aeropuerto de Barcelona T1, necesita 1 h \d+ min → llegaría 12:\d\d y la recogida es a las 11:30$/);
  });
  test("no llega al siguiente", () => {
    const r = encaja(sv("x", "16:00", 60, salou, bcn), agenda);
    expect(r.encaja).toBe(false);
    expect(r.peor!.siguienteId).toBe("n");
  });
  test("solape", () => {
    const r = encaja(sv("x", "10:30", 30, bcn, bcn), agenda);
    expect(r.encaja).toBe(false);
    expect(r.solapa).toBe(true);
  });
  test("agenda vacía o sin coordenadas: encaja", () => {
    expect(encaja(sv("x", "10:00", 30, null, null), []).encaja).toBe(true);
    expect(encaja(sv("x", "14:00", 30, null, null), agenda).encaja).toBe(true);
  });
});

describe("sugerirConductores con tiempos", () => {
  const base = (id: string, agenda: Candidato["agenda"]): Candidato => ({
    conductorId: id, nombre: id, vehiculo: { id: "v" + id, plazas: 8, maletas: 8, estado: "activo" }, posicion: null, agenda });
  const s = { id: "s", inicio: T("16:00"), duracionMin: 45, pasajeros: 2, maletas: 2, origen: salou, destino: reus };
  const ahora = T("08:00");
  test("descarta al que no llega y ordena al resto", () => {
    const r = sugerirConductores(s, [
      base("lejos", [{ servicioId: "a", inicio: T("14:00"), fin: T("15:10"), destino: bcn, destinoTexto: "Aeropuerto de Barcelona T1" }]),
      base("justo", [{ servicioId: "b", inicio: T("14:00"), fin: T("15:40"), destino: tarragona }]),
      base("holgado", [{ servicioId: "c", inicio: T("13:00"), fin: T("14:00"), destino: tarragona, destinoTexto: "Tarragona" }]),
    ], ahora);
    expect(r.map((x) => x.conductorId)).toEqual(["holgado", "justo", "lejos"]);
    expect(r[2].apto).toBe(false);
    expect(r[2].motivos).toContain("No llega a tiempo desde Aeropuerto de Barcelona T1");
    expect(r[0].motivos.some((m) => /^Llega con \d+ min de margen desde Tarragona$/.test(m))).toBe(true);
    expect(r[0].motivos).toContain("Libre a esa hora");
  });
  test("no llega al siguiente servicio", () => {
    const r = sugerirConductores(s, [base("x", [{ servicioId: "n", inicio: T("16:50"), fin: T("17:30"), destino: null, origen: bcn, origenTexto: "BCN" }])], ahora);
    expect(r[0].apto).toBe(false);
    expect(r[0].motivos).toContain("No llega a tiempo al siguiente servicio a BCN");
  });
});
