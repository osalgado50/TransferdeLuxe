import { expect, test } from "vitest";
import { construirDemo, NOTA_DEMO, enEvaluacion, debeRenovar, aparcamiento } from "@/lib/demo/datosDemo";
import { madridAUtc } from "@/lib/dominio/dias";

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

// ── Demo viva ──
const madrid = (dia: string, hora: string) => Date.parse(madridAUtc(dia, hora));

test("evaluación: del 20 al 27/10 en hora de Madrid, ambos incluidos", () => {
  expect(enEvaluacion(madrid("2026-10-19", "23:59"))).toBe(false);
  expect(enEvaluacion(madrid("2026-10-20", "00:00"))).toBe(true);
  expect(enEvaluacion(madrid("2026-10-27", "23:59"))).toBe(true);
  expect(enEvaluacion(madrid("2026-10-28", "00:00"))).toBe(false);
});

test("renovar: solo con demo cargada hace más de 4 h, sin nadie tocándola y de día", () => {
  const ahora = madrid("2026-10-22", "10:00");
  const h = 3600e3;
  expect(debeRenovar({ ultimaCarga: null, ultimaAccion: null, ahora })).toBe(false); // nunca cargada (o archivada)
  expect(debeRenovar({ ultimaCarga: ahora - 3 * h, ultimaAccion: null, ahora })).toBe(false); // aún fresca
  expect(debeRenovar({ ultimaCarga: ahora - 5 * h, ultimaAccion: null, ahora })).toBe(true);
  expect(debeRenovar({ ultimaCarga: ahora - 5 * h, ultimaAccion: ahora - 10 * 60e3, ahora })).toBe(false); // alguien probando
  expect(debeRenovar({ ultimaCarga: ahora - 5 * h, ultimaAccion: ahora - 45 * 60e3, ahora })).toBe(true);
  const noche = madrid("2026-10-22", "03:00");
  expect(debeRenovar({ ultimaCarga: noche - 10 * h, ultimaAccion: null, ahora: noche })).toBe(false);
  expect(debeRenovar({ ultimaCarga: noche - 10 * h, ultimaAccion: null, ahora: madrid("2026-10-22", "06:05") })).toBe(true);
});
