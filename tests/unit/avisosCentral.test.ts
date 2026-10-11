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
  test("rechazado con nombre y motivo; expirado; aceptado; otros eventos se ignoran", () => {
    const r = construirAvisos(base({ eventos: [
      { id: 1, servicio_id: "s1", tipo: "rechazado", actor_id: "c1", motivo: "Avería" },
      { id: 2, servicio_id: "s1", tipo: "expirado", actor_id: null, motivo: null },
      { id: 3, servicio_id: "s1", tipo: "aceptado", actor_id: "c1", motivo: null },
      { id: 4, servicio_id: "zz", tipo: "rechazado", actor_id: "c1", motivo: "x" },
      { id: 5, servicio_id: "s1", tipo: "en_camino", actor_id: "c1", motivo: null },
    ] }));
    expect(r.map((a) => a.titulo)).toEqual(["Rechazado por Laia Demo: Avería", "Sin respuesta del conductor", "Laia Demo ha aceptado"]);
    expect(r[2]).toEqual({ titulo: "Laia Demo ha aceptado", cuerpo: "Reus → Salou 15:00", data: { tipo: "aceptado", servicioId: "s1" } });
  });
  test("retraso en la recogida: conductor asignado (el evento no tiene actor) y zona de su última posición", () => {
    const servicios = new Map([["s1", { ...S, conductor_id: "c1" }]]);
    const e = { id: 9, servicio_id: "s1", tipo: "retraso_recogida", actor_id: null, motivo: "Hora de recogida superada y sin recoger" };
    expect(construirAvisos(base({ servicios, eventos: [e], posiciones: new Map([["c1", { lat: 41.156, lng: 1.107 }]]) }))).toEqual([
      { titulo: "⏰ Laia Demo llega tarde a la recogida", cuerpo: "Reus → Salou 15:00 · en Reus", data: { tipo: "retraso_recogida", servicioId: "s1" } },
    ]);
    expect(construirAvisos(base({ servicios, eventos: [e] }))[0].cuerpo).toBe("Reus → Salou 15:00");
  });
  test("avería/accidente: GRAVE primero, con tipo, conductor y zona (de la incidencia o de su GPS); leves con zona", () => {
    const r = construirAvisos(base({
      revisiones: [{ conductor_id: "c1", vehiculo_id: "v1" }],
      incidencias: [
        { id: "i0", conductor_id: "c1", servicio_id: null, tipo: "retraso", descripcion: "Atasco", lat: 41.0764, lng: 1.1416 },
        { id: "i1", conductor_id: "c1", servicio_id: null, tipo: "averia", descripcion: "Pinchazo" },
        { id: "i2", conductor_id: "c1", servicio_id: "s1", tipo: "accidente", descripcion: "", lat: 41.145, lng: 0.82 },
      ],
      posiciones: new Map([["c1", { lat: 41.156, lng: 1.107 }]]),
    }));
    expect(r).toEqual([
      { titulo: "⚠ AVERÍA · Laia Demo · en Reus", cuerpo: "Pinchazo", data: { tipo: "incidencia", incidenciaId: "i1", grave: true } },
      { titulo: "⚠ ACCIDENTE · Laia Demo · en Falset", cuerpo: "Reus → Salou 15:00", data: { tipo: "incidencia", servicioId: "s1", incidenciaId: "i2", grave: true } },
      { titulo: "Incidencia: Retraso", cuerpo: "Laia Demo · en Salou · Atasco", data: { tipo: "incidencia", incidenciaId: "i0" } },
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
