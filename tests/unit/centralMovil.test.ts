import { describe, expect, test } from "vitest";
import { accionAsignacion, agruparServiciosCentral, textoAlertaCentral } from "@/lib/dominio/centralMovil";
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

describe("agruparServiciosCentral", () => {
  const s = (id: string, estado: string, h: string) => ({ id, estado, fecha_hora_recogida: `2026-10-15T${h}:00Z` }) as never;
  test("agrupa, ordena, quita duplicados y omite vacíos", () => {
    const g = agruparServiciosCentral([s("p2", "pendiente", "12:00"), s("p1", "pendiente", "09:00")],
      [s("p1", "pendiente", "09:00"), s("a", "aceptado", "10:00"), s("r", "recogido", "08:00")]);
    expect(g.map((x) => x.clave)).toEqual(["pendientes", "en_curso", "proximos"]);
    expect(g[0].servicios.map((x: { id: string }) => x.id)).toEqual(["p1", "p2"]);
  });
  test("sin servicios → sin grupos", () => { expect(agruparServiciosCentral([], [])).toEqual([]); });
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
