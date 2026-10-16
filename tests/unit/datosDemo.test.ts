import { expect, test } from "vitest";
import { construirDemo, NOTA_DEMO } from "@/lib/demo/datosDemo";

const ahora = new Date("2026-10-20T10:00:00Z");
const conductores = ["a", "b", "c", "d", "e"].map((x) => ({ id: `c-${x}`, nombre: x.toUpperCase(), vehiculoId: `v-${x}` }));
let k = 0;
const demo = construirDemo(ahora, conductores, () => `id-${++k}`);

test("cubre todos los estados que se ven en el panel", () => {
  const estados = new Set(demo.servicios.map((s) => s.estado));
  for (const e of ["completado", "cancelado", "recogido", "en_camino", "aceptado", "asignado", "pendiente"]) expect(estados.has(e)).toBe(true);
  expect(demo.servicios.filter((s) => s.estado === "pendiente" && Date.parse(s.fecha_hora_recogida) > ahora.getTime() + 20 * 3600e3)).toHaveLength(5); // mañana
  expect(demo.servicios.some((s) => s.ultima_incidencia?.startsWith("rechazado") && !s.incidencia_vista)).toBe(true);
  expect(demo.servicios.some((s) => s.origen_pedido === "web" && s.estado === "pendiente")).toBe(true);
  expect(demo.incidencias).toHaveLength(1);
});

test("historial coherente: cada servicio empieza por «creado» y sus eventos van en orden", () => {
  for (const s of demo.servicios) {
    const evs = demo.eventos.filter((e) => e.servicio_id === s.id);
    expect(evs[0].tipo).toBe("creado");
    const t = evs.map((e) => Date.parse(e.creado_en));
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    const ultimo = evs.at(-1)!.tipo;
    if (s.estado !== "pendiente") expect(ultimo).toBe({ completado: "completado", cancelado: "cancelado", recogido: "recogido", en_camino: "en_camino", aceptado: "aceptado", asignado: "asignado" }[s.estado]);
  }
});

test("conductor y vehículo solo donde toca; ids únicos; todo marcado como demo y sin datos reales", () => {
  for (const s of demo.servicios) {
    const conConductor = ["completado", "recogido", "en_camino", "aceptado", "asignado"].includes(s.estado);
    expect(!!s.conductor_id).toBe(conConductor);
    if (conConductor) expect(s.vehiculo_id).toMatch(/^v-/);
    expect(s.notas).toBe(NOTA_DEMO);
    expect(s.cliente_email).toMatch(/@ejemplo\.test$/);
  }
  expect(new Set(demo.servicios.map((s) => s.id)).size).toBe(demo.servicios.length);
});

test("un coche por conductor en el mapa (posiciones simuladas) y sin conductores, sin asignaciones", () => {
  expect(new Set(demo.posiciones.map((p) => p.conductor_id)).size).toBe(conductores.length);
  expect(demo.posiciones.every((p) => p.simulada)).toBe(true);
  // Solo columnas de la tabla posiciones (un campo de más hace fallar la inserción).
  for (const p of demo.posiciones) expect(Object.keys(p).sort()).toEqual(["conductor_id", "lat", "lng", "registrado_en", "simulada", "velocidad"]);
  const sin = construirDemo(ahora, []);
  expect(sin.servicios.every((s) => !s.conductor_id && ["pendiente", "cancelado"].includes(s.estado))).toBe(true);
  expect(sin.posiciones).toEqual([]);
});
