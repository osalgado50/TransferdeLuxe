import { describe, expect, it } from "vitest";
import { SONIDOS, crearAntiRafaga, eventosNuevos, gravedad, masGrave, sonidoDeEvento, type Sonido } from "@/lib/dominio/sonidos";

describe("sonidoDeEvento", () => {
  it("cada evento del ciclo del servicio tiene su sonido", () => {
    expect(sonidoDeEvento("asignado")).toBe("enviado");
    expect(sonidoDeEvento("reasignado")).toBe("enviado");
    expect(sonidoDeEvento("aceptado")).toBe("aceptado");
    expect(sonidoDeEvento("rechazado")).toBe("rechazado");
    expect(sonidoDeEvento("expirado")).toBe("rechazado");
    expect(sonidoDeEvento("en_camino")).toBe("en_camino");
    expect(sonidoDeEvento("recogido")).toBe("cargado");
    expect(sonidoDeEvento("completado")).toBe("completado");
    expect(sonidoDeEvento("llegando_recogida")).toBe("llegando");
    expect(sonidoDeEvento("llegando_destino")).toBe("llegando");
  });
  it("«creado» suena solo si es de la web (o aún no se sabe); las manuales las crea la propia central", () => {
    expect(sonidoDeEvento("creado", "web")).toBe("reserva_nueva");
    expect(sonidoDeEvento("creado")).toBe("reserva_nueva");
    expect(sonidoDeEvento("creado", "manual")).toBeNull();
  });
  it("eventos informativos o provocados por la central: sin sonido", () => {
    for (const t of ["cancelado", "subcontratado", "llegada_vuelo", "recogida_reajustada", "desconocido"]) expect(sonidoDeEvento(t)).toBeNull();
  });
});

describe("catálogo y gravedad", () => {
  it("todos los sonidos están en el catálogo una vez, con gravedades distintas", () => {
    const ids = SONIDOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(9);
    expect(new Set(SONIDOS.map((s) => s.gravedad)).size).toBe(9);
    expect(SONIDOS.every((s) => s.nombre && s.significado)).toBe(true);
  });
  it("la incidencia es lo más grave y el envío lo más leve", () => {
    expect(gravedad("incidencia")).toBeGreaterThan(gravedad("rechazado"));
    expect(gravedad("rechazado")).toBeGreaterThan(gravedad("aceptado"));
    expect(masGrave("enviado", "incidencia")).toBe("incidencia");
    expect(masGrave("rechazado", "aceptado")).toBe("rechazado");
    expect(masGrave(null, "en_camino")).toBe("en_camino");
  });
});

describe("eventosNuevos", () => {
  const ahora = Date.parse("2026-10-11T10:00:00Z");
  it("no repite eventos ya vistos y descarta los antiguos (pero los marca)", () => {
    const vistos = new Set<number>([1]);
    const evs = [
      { id: 1, creado_en: "2026-10-11T09:59:50Z" },
      { id: 2, creado_en: "2026-10-11T09:59:30Z" },
      { id: 3, creado_en: "2026-10-11T09:40:00Z" },
    ];
    expect(eventosNuevos(evs, vistos, ahora).map((e) => e.id)).toEqual([2]);
    expect(vistos.has(3)).toBe(true);
    expect(eventosNuevos(evs, vistos, ahora)).toEqual([]);
  });
});

describe("crearAntiRafaga", () => {
  function relojFalso() {
    let t = 0;
    const tareas: { f: () => void; en: number }[] = [];
    return {
      reloj: {
        ahora: () => t,
        programar: (f: () => void, ms: number) => { const x = { f, en: t + ms }; tareas.push(x); return x; },
        cancelar: (x: unknown) => { const i = tareas.indexOf(x as (typeof tareas)[number]); if (i >= 0) tareas.splice(i, 1); },
      },
      avanzar(ms: number) {
        const fin = t + ms;
        for (;;) {
          tareas.sort((a, b) => a.en - b.en);
          const x = tareas[0];
          if (!x || x.en > fin) break;
          tareas.shift(); t = x.en; x.f();
        }
        t = fin;
      },
    };
  }

  it("una ráfaga simultánea suena una sola vez, con el más grave", () => {
    const r = relojFalso(); const oidos: Sonido[] = [];
    const a = crearAntiRafaga((s) => oidos.push(s), 1500, 120, r.reloj);
    a.pedir("enviado"); a.pedir("incidencia"); a.pedir("aceptado");
    r.avanzar(200);
    expect(oidos).toEqual(["incidencia"]);
  });
  it("como mucho uno cada 1,5 s; lo que llega entretanto se agrupa", () => {
    const r = relojFalso(); const oidos: { s: Sonido; t: number }[] = [];
    const a = crearAntiRafaga((s) => oidos.push({ s, t: r.reloj.ahora() }), 1500, 120, r.reloj);
    a.pedir("en_camino");
    r.avanzar(500);
    a.pedir("cargado"); a.pedir("rechazado");
    r.avanzar(500);
    a.pedir("completado");
    r.avanzar(3000);
    expect(oidos.map((o) => o.s)).toEqual(["en_camino", "rechazado"]);
    expect(oidos[1].t - oidos[0].t).toBeGreaterThanOrEqual(1500);
  });
  it("cancelar descarta lo pendiente", () => {
    const r = relojFalso(); const oidos: Sonido[] = [];
    const a = crearAntiRafaga((s) => oidos.push(s), 1500, 120, r.reloj);
    a.pedir("aceptado"); a.cancelar();
    r.avanzar(5000);
    expect(oidos).toEqual([]);
  });
});
