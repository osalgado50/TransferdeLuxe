import { describe, expect, test } from "vitest";
import { construirAvisos, lugarCorto, MAX_AVISOS, type Entrada } from "@/lib/dominio/avisosCentral";

const S = { id: "s1", origen_texto: "Reus, Tarragona", destino_texto: "Salou", fecha_hora_recogida: "2026-10-11T13:00:00Z", origen_pedido: "web" };
const base = (o: Partial<Entrada> = {}): Entrada => ({
  eventos: [], incidencias: [], revisiones: [], servicios: new Map([["s1", S]]),
  nombres: new Map([["c1", "Laia Demo"]]), matriculas: new Map([["v1", "0002-TDL"]]), ...o,
});

describe("construirAvisos", () => {
  test("reserva web nueva; las manuales no avisan", () => {
    expect(construirAvisos(base({ eventos: [{ id: 1, servicio_id: "s1", tipo: "creado", actor_id: null, motivo: null }] })))
      .toEqual([{ titulo: "Reserva nueva", cuerpo: "Reus → Salou 15:00", data: { tipo: "reserva_nueva", servicioId: "s1" } }]);
    const manual = new Map([["s1", { ...S, origen_pedido: "manual" }]]);
    expect(construirAvisos(base({ servicios: manual, eventos: [{ id: 1, servicio_id: "s1", tipo: "creado", actor_id: null, motivo: null }] }))).toEqual([]);
  });
  test("rechazado con nombre y motivo; expirado; otros eventos se ignoran", () => {
    const r = construirAvisos(base({ eventos: [
      { id: 1, servicio_id: "s1", tipo: "rechazado", actor_id: "c1", motivo: "Avería" },
      { id: 2, servicio_id: "s1", tipo: "expirado", actor_id: null, motivo: null },
      { id: 3, servicio_id: "s1", tipo: "aceptado", actor_id: "c1", motivo: null },
      { id: 4, servicio_id: "zz", tipo: "rechazado", actor_id: "c1", motivo: "x" },
    ] }));
    expect(r.map((a) => a.titulo)).toEqual(["Rechazado por Laia Demo: Avería", "Sin respuesta del conductor"]);
  });
  test("incidencia y checklist con fallos", () => {
    const r = construirAvisos(base({ incidencias: [{ conductor_id: "c1", servicio_id: null, tipo: "averia", descripcion: "Pinchazo" }], revisiones: [{ conductor_id: "c1", vehiculo_id: "v1" }] }));
    expect(r).toEqual([
      { titulo: "Incidencia: Avería", cuerpo: "Laia Demo · Pinchazo", data: { tipo: "incidencia" } },
      { titulo: "Checklist con fallos", cuerpo: "Laia Demo · 0002-TDL", data: { tipo: "checklist" } },
    ]);
  });
  test("muchos avisos → se resumen", () => {
    const r = construirAvisos(base({ revisiones: Array.from({ length: 12 }, () => ({ conductor_id: "c1", vehiculo_id: "v1" })) }));
    expect(r).toHaveLength(MAX_AVISOS);
    expect(r.at(-1)!.titulo).toBe(`${12 - MAX_AVISOS + 1} avisos más en la central`);
  });
  test("lugarCorto recorta", () => {
    expect(lugarCorto("Aeropuerto de Barcelona-El Prat Josep Tarradellas, T1")).toHaveLength(28);
  });
});
