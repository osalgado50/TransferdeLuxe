import { expect, test } from "vitest";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";

const salou = { lat: 41.0763, lng: 1.1416 };
const cambrils = { lat: 41.0670, lng: 1.0597 };
const tarragona = { lat: 41.1189, lng: 1.2445 };
const ahora = new Date("2026-10-15T08:00:00Z");
const servicio = { id: "s1", inicio: new Date("2026-10-15T08:30:00Z"), duracionMin: 40, pasajeros: 6, origen: salou };

const base = (id: string, extra: Partial<Candidato> = {}): Candidato => ({
  conductorId: id, nombre: id,
  vehiculo: { id: "v" + id, plazas: 8, estado: "activo" },
  posicion: null, agenda: [], ...extra,
});

test("descarta por plazas, taller y solape, con motivos", () => {
  const r = sugerirConductores(servicio, [
    base("pocas", { vehiculo: { id: "v", plazas: 4, estado: "activo" } }),
    base("taller", { vehiculo: { id: "v", plazas: 8, estado: "taller" } }),
    base("ocupado", { agenda: [{ servicioId: "x", inicio: new Date("2026-10-15T08:00:00Z"), fin: new Date("2026-10-15T09:00:00Z"), destino: null }] }),
    base("sinVehiculo", { vehiculo: null }),
  ], ahora);
  expect(r.every((s) => !s.apto)).toBe(true);
  expect(r.find((s) => s.conductorId === "pocas")!.motivos).toContain("Vehículo de 4 plazas (necesita 6)");
  expect(r.find((s) => s.conductorId === "taller")!.motivos).toContain("Vehículo en taller");
  expect(r.find((s) => s.conductorId === "ocupado")!.motivos).toContain("Ocupado a esa hora");
  expect(r.find((s) => s.conductorId === "sinVehiculo")!.motivos).toContain("Sin vehículo asignado");
});

test("servicio inminente: ordena por GPS reciente", () => {
  const r = sugerirConductores(servicio, [
    base("lejos", { posicion: { punto: tarragona, registradoEn: ahora } }),
    base("cerca", { posicion: { punto: cambrils, registradoEn: ahora } }),
  ], ahora);
  expect(r.map((s) => s.conductorId)).toEqual(["cerca", "lejos"]);
  expect(r[0].apto).toBe(true);
  expect(r[0].motivos[0]).toMatch(/^A \d+(\.\d)? km \(GPS\)$/);
});

test("servicio lejano: usa el destino del servicio anterior", () => {
  const tarde = { ...servicio, inicio: new Date("2026-10-15T15:00:00Z") };
  const r = sugerirConductores(tarde, [
    base("a", { agenda: [{ servicioId: "p", inicio: new Date("2026-10-15T12:00:00Z"), fin: new Date("2026-10-15T13:00:00Z"), destino: tarragona }] }),
    base("b", { agenda: [{ servicioId: "q", inicio: new Date("2026-10-15T12:00:00Z"), fin: new Date("2026-10-15T13:00:00Z"), destino: salou }] }),
  ], ahora);
  expect(r[0].conductorId).toBe("b");
  expect(r[0].motivos[0]).toMatch(/servicio anterior/);
});

test("GPS antiguo (>5 min) no cuenta como posición", () => {
  const r = sugerirConductores(servicio, [
    base("viejo", { posicion: { punto: salou, registradoEn: new Date("2026-10-15T07:00:00Z") } }),
  ], ahora);
  expect(r[0].distanciaKm).toBeNull();
});
