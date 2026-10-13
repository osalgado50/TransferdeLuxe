import { describe, expect, test } from "vitest";
import { construirAvisos, lugarCorto, MAX_AVISOS, type Entrada } from "@/lib/dominio/avisosCentral";
import { tecnicoInicial } from "@/lib/dominio/cierre";
import { sonidoDeAviso } from "@/lib/dominio/sonidoPush";

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

describe("hoja de cierre → push a la central", () => {
  const c = (o: object) => ({ id: "k1", conductor_id: "c1", vehiculo_id: "v1", zonas: [] as string[], tecnico: tecnicoInicial(), combustible: "lleno", comentario: "", gravedad: "ok" as const, ...o });
  test("grave primero (alarma), mantenimiento (aviso) y todo en verde", () => {
    const r = construirAvisos(base({
      eventos: [{ id: 3, servicio_id: "s1", tipo: "aceptado", actor_id: "c1", motivo: null }],
      cierres: [
        c({ id: "ok" }),
        c({ id: "man", gravedad: "mantenimiento", tecnico: { ...tecnicoInicial(), refrigerante: "falta" } }),
        c({ id: "gr", gravedad: "grave", zonas: ["capo"], comentario: "Piedra en el capó" }),
      ],
    }));
    expect(r[0]).toEqual({ titulo: "🔴 Daños en Capó · 0002-TDL · Laia Demo", cuerpo: "«Piedra en el capó»", data: { tipo: "cierre", cierreId: "gr", grave: true } });
    expect(r.map((a) => a.data.tipo)).toEqual(["cierre", "aceptado", "cierre_ok", "cierre_mantenimiento"]);
    expect(r[2].titulo).toBe("🟢 Cierre sin incidencias · 0002-TDL · Laia Demo");
    expect(r[3].titulo).toBe("🟠 Falta agua de motor · 0002-TDL · Laia Demo");
    expect(r.map((a) => sonidoDeAviso(a.data))).toEqual(["alarma", "aceptado", null, "aviso"]);
  });
});

describe("servicio devuelto → push a la central", () => {
  test("título con conductor, hora y motivo", () => {
    const r = construirAvisos(base({ nombres: new Map([["c1", "Marc"]]), eventos: [{ id: 9, servicio_id: "s1", tipo: "devuelto", actor_id: "c1", motivo: "Avería" }] }));
    expect(r).toEqual([{ titulo: "🔁 Marc ha devuelto el servicio de las 15:00: Avería", cuerpo: "Reus → Salou 15:00 · Reasígnalo", data: { tipo: "devuelto", servicioId: "s1" } }]);
  });
  test("el aviso al cliente no genera push", () => {
    expect(construirAvisos(base({ eventos: [{ id: 10, servicio_id: "s1", tipo: "aviso_cliente", actor_id: "c1", motivo: "en_camino" }] }))).toEqual([]);
  });
});

describe("fin de jornada, jornada cerrada con pendientes y CARGA/DESCARGA lejos", () => {
  const S2 = { ...S, id: "s2", fecha_hora_recogida: "2026-10-11T16:30:00Z" };
  const servicios = new Map([["s1", S], ["s2", S2]]);
  test("las devoluciones por «Fin de jornada» del mismo conductor van en UN aviso; las demás, sueltas", () => {
    const r = construirAvisos(base({ servicios, eventos: [
      { id: 1, servicio_id: "s1", tipo: "rechazado", actor_id: "c1", motivo: "Fin de jornada", creado_en: "2026-10-11T10:00:00Z" },
      { id: 2, servicio_id: "s2", tipo: "devuelto", actor_id: "c1", motivo: "Fin de jornada", creado_en: "2026-10-11T10:00:02Z" },
    ] }));
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe("🔁 Laia Demo ha terminado la jornada y ha devuelto 2 servicios de esta tarde");
    expect(r[0].cuerpo).toBe("Reus → Salou 15:00 · Reus → Salou 18:30 · Reasígnalos");
    expect(sonidoDeAviso(r[0].data)).toBe("aviso");
    const suelto = construirAvisos(base({ eventos: [{ id: 3, servicio_id: "s1", tipo: "devuelto", actor_id: "c1", motivo: "Avería" }] }));
    expect(suelto[0].titulo).toMatch(/^🔁 Laia Demo ha devuelto el servicio de las 15:00: Avería$/);
  });
  test("jornada cerrada con servicios pendientes hoy → aviso con sonido de aviso", () => {
    const r = construirAvisos(base({ jornadasPendientes: [{ conductor_id: "c1", horas: ["16:00", "18:30"] }, { conductor_id: "c1", horas: [] }] }));
    expect(r).toEqual([{ titulo: "⚠️ Laia Demo ha cerrado la jornada con 2 servicios pendientes hoy (16:00, 18:30)",
      cuerpo: "Llama al conductor o reasigna esos servicios", data: { tipo: "jornada_pendientes" } }]);
    expect(sonidoDeAviso(r[0].data)).toBe("aviso");
  });
  test("CARGA lejos de la recogida: distancia, lugar y zona del conductor", () => {
    const r = construirAvisos(base({ servicios: new Map([["s1", { ...S, origen_texto: "Salou – Plaza Europa, Salou" }]]),
      eventos: [{ id: 9, servicio_id: "s1", tipo: "anomalia_carga", actor_id: "c1", motivo: "d=2300;lat=41.06700;lng=1.05970" }] }));
    expect(r[0].titulo).toBe("⚠️ Laia Demo ha marcado CARGA a 2,3 km de la recogida (Salou – Plaza Europa) · está en Cambrils");
    expect(r[0].data).toEqual({ tipo: "anomalia_carga", servicioId: "s1" });
    expect(sonidoDeAviso(r[0].data)).toBe("aviso");
  });
});
