import { describe, expect, test } from "vitest";
import { accionAsignacion, agruparServiciosCentral, contarPorGrupo, contarServiciosPorGrupo, esFiltroGrupo, estadosDeGrupo, filtrarPorGrupo,
  filtroInicial, grupoDeEstado, serviciosCentralUnicos, textoAlertaCentral } from "@/lib/dominio/centralMovil";
import { marcadoresFlota } from "@/lib/dominio/mapa";

const base = { estado: "asignado" as const, conductor_id: "c1", ultima_incidencia: null as string | null, subcontratar: false, pasajeros: 3, maletas: 2 };
const nombre = (id: string | null) => (id === "c1" ? "Ana Demo" : "conductor");

describe("textoAlertaCentral", () => {
  test("rechazado con motivo y nombre", () => {
    expect(textoAlertaCentral({ ...base, estado: "pendiente", ultima_incidencia: "rechazado: Avería" }, nombre))
      .toEqual({ titulo: "Rechazado", texto: "Rechazado por Ana Demo: Avería" });
  });
  test("expirado, nuevo, genérico y vacío", () => {
    expect(textoAlertaCentral({ ...base, ultima_incidencia: "expirado" }, nombre).titulo).toBe("Sin respuesta");
    expect(textoAlertaCentral({ ...base, ultima_incidencia: "nuevo" }, nombre)).toEqual({ titulo: "Reserva nueva", texto: "Reserva nueva" });
    expect(textoAlertaCentral({ ...base, ultima_incidencia: "Pinchazo" }, nombre)).toEqual({ titulo: "Aviso", texto: "Pinchazo" });
    expect(textoAlertaCentral(base, nombre).texto).toBe("Incidencia");
  });
  test("subcontratar pendiente", () => {
    const r = textoAlertaCentral({ ...base, estado: "pendiente", subcontratar: true }, nombre);
    expect(r.titulo).toBe("Subcontratar");
    expect(r.texto).toContain("3 pax, 2 maletas");
  });
});

describe("grupos de la central", () => {
  const s = (id: string, estado: string, h: string) => ({ id, estado, fecha_hora_recogida: `2026-10-15T${h}:00Z` }) as never;
  const lista = () => serviciosCentralUnicos([s("p2", "pendiente", "12:00"), s("p1", "pendiente", "09:00")],
    [s("p1", "pendiente", "09:00"), s("a", "aceptado", "10:00"), s("r", "recogido", "08:00"), s("x", "asignado", "11:00"), s("c", "cancelado", "07:00")]);
  test("une sin duplicados y ordena por hora", () => {
    expect(lista().map((x: { id: string }) => x.id)).toEqual(["c", "r", "p1", "a", "x", "p2"]);
  });
  test("agrupa en el orden de los chips y omite vacíos", () => {
    const g = agruparServiciosCentral(lista());
    expect(g.map((x) => x.clave)).toEqual(["sin_asignar", "esperando", "en_curso", "terminados"]);
    expect(g[2].servicios.map((x: { id: string }) => x.id)).toEqual(["r", "a"]);
    expect(agruparServiciosCentral([])).toEqual([]);
  });
  test("contadores y filtrado", () => {
    const c = contarServiciosPorGrupo(lista());
    expect(c).toEqual({ todos: 6, sin_asignar: 2, esperando: 1, en_curso: 2, terminados: 1 });
    expect(filtrarPorGrupo(lista(), "esperando").map((x: { id: string }) => x.id)).toEqual(["x"]);
    expect(filtrarPorGrupo(lista(), "todos")).toHaveLength(6);
  });
  test("contadores desde recuentos por estado", () => {
    expect(contarPorGrupo({ pendiente: 3, asignado: 0, aceptado: 1, en_camino: 2, completado: 4, subcontratado: 1 }))
      .toEqual({ todos: 11, sin_asignar: 3, esperando: 0, en_curso: 3, terminados: 5 });
  });
  test("filtro inicial, validación y estados", () => {
    expect(filtroInicial({ todos: 2, sin_asignar: 1, esperando: 0, en_curso: 1, terminados: 0 })).toBe("sin_asignar");
    expect(filtroInicial({ todos: 2, sin_asignar: 0, esperando: 1, en_curso: 1, terminados: 0 })).toBe("todos");
    expect(esFiltroGrupo("en_curso")).toBe(true);
    expect(esFiltroGrupo("pendiente")).toBe(false);
    expect(estadosDeGrupo("todos")).toBeNull();
    expect(grupoDeEstado("aceptado")).toBe("en_curso");
  });
});

test("accionAsignacion", () => {
  expect(accionAsignacion({ estado: "pendiente", conductor_id: null })).toBe("asignar");
  expect(accionAsignacion({ estado: "aceptado", conductor_id: "c" })).toBe("reasignar");
  expect(accionAsignacion({ estado: "en_camino", conductor_id: "c" })).toBeNull();
});

test("marcadoresFlota", () => {
  const ahora = new Date("2026-10-15T10:00:00Z");
  const pos = (id: string, min: number) => ({ conductor_id: id, lat: 41, lng: 1, velocidad: 0, en_servicio: true, registrado_en: new Date(ahora.getTime() - min * 60_000).toISOString() });
  const m = marcadoresFlota([pos("c1", 1), pos("c2", 9)], [{ conductor_id: "c1", estado: "recogido", fecha_hora_recogida: "2026-10-15T09:00:00Z" }],
    [{ id: "c1", nombre: "Ana Demo" }], ahora, 5);
  expect(m[0]).toMatchObject({ nombre: "Ana Demo", estado: "con_pasajeros", texto: "Con pasajeros", minutos: 1 });
  expect(m[1]).toMatchObject({ nombre: "Conductor", estado: "sin_senal", minutos: 9 });
});
