import { describe, expect, test } from "vitest";
import { calcularSeguimiento, esTokenSeguimiento, idiomaPreferido, type EntradaSeguimiento } from "@/lib/dominio/seguimiento";

const ahora = new Date("2026-10-13T13:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
const base = (o: Partial<EntradaSeguimiento> = {}, estado = "en_camino"): EntradaSeguimiento => ({
  servicio: { estado, origen_lat: 41.076, origen_lng: 1.14, destino_lat: 41.1474, destino_lng: 1.1672 },
  eventos: [{ tipo: "aceptado", creado_en: hace(30) }, { tipo: "en_camino", creado_en: hace(10) }],
  posicion: { lat: 41.15, lng: 1.11, registrado_en: hace(0.2) },
  conductor: "Marc García", vehiculo: { modelo: "Mercedes Clase V", matricula: "1234 ABC" }, ahora, ...o,
});

describe("calcularSeguimiento", () => {
  test("de camino: posición, ETA a la recogida, nombre de pila y vehículo (nada del cliente)", () => {
    const r = calcularSeguimiento(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.estado).toBe("de_camino");
    expect(r.datos.conductor).toBe("Marc");
    expect(r.datos.vehiculo).toEqual({ modelo: "Mercedes Clase V", matricula: "1234 ABC" });
    expect(r.datos.posicion).toMatchObject({ lat: 41.15, lng: 1.11 });
    expect(r.datos.eta?.objetivo).toBe("recogida");
    expect(r.datos.eta?.minutos).toBeGreaterThan(5);
    expect(r.datos.eta?.hora).toMatch(/^\d\d:\d\d$/);
    expect(Object.keys(r.datos).sort()).toEqual(["actualizado", "conductor", "estado", "eta", "posicion", "vehiculo"]);
  });
  test("llegando: cerca de la recogida o tras el aviso «llegando»", () => {
    const cerca = calcularSeguimiento(base({ posicion: { lat: 41.0765, lng: 1.1405, registrado_en: hace(0) } }));
    expect(cerca.ok && cerca.datos.estado).toBe("llegando");
    const ev = calcularSeguimiento(base({ eventos: [...base().eventos, { tipo: "llegando_recogida", creado_en: hace(1) }] }));
    expect(ev.ok && ev.datos.estado).toBe("llegando");
  });
  test("a bordo: ETA al destino", () => {
    const r = calcularSeguimiento(base({}, "recogido"));
    expect(r.ok && r.datos.estado).toBe("a_bordo");
    expect(r.ok && r.datos.eta?.objetivo).toBe("destino");
  });
  test("aceptado sin salir: confirmado, sin posición; con aviso «en camino» ya enseña el coche", () => {
    const r = calcularSeguimiento(base({ eventos: [{ tipo: "aceptado", creado_en: hace(30) }] }, "aceptado"));
    expect(r.ok && r.datos).toMatchObject({ estado: "confirmado", posicion: null, eta: null, conductor: "Marc" });
    const c = calcularSeguimiento(base({ eventos: [{ tipo: "aceptado", creado_en: hace(30) }, { tipo: "aviso_cliente", motivo: "en_camino", creado_en: hace(2) }] }, "aceptado"));
    expect(c.ok && c.datos.estado).toBe("de_camino");
  });
  test("posición vieja (> 30 min): sin posición ni ETA", () => {
    const r = calcularSeguimiento(base({ posicion: { lat: 41.15, lng: 1.11, registrado_en: hace(45) } }));
    expect(r.ok && r.datos).toMatchObject({ estado: "de_camino", posicion: null, eta: null });
  });
  test("devuelto / sin aceptar: asignando, sin conductor ni coche", () => {
    const r = calcularSeguimiento(base({}, "pendiente"));
    expect(r.ok && r.datos).toMatchObject({ estado: "asignando", posicion: null, conductor: null, vehiculo: null });
  });
  test("finalizado: 30 min después de completar; luego caduca", () => {
    const fin = (min: number) => base({ eventos: [{ tipo: "completado", creado_en: hace(min) }] }, "completado");
    const r = calcularSeguimiento(fin(10));
    expect(r.ok && r.datos).toMatchObject({ estado: "finalizado", posicion: null, conductor: null });
    expect(calcularSeguimiento(fin(31))).toEqual({ ok: false, motivo: "caducado" });
    expect(calcularSeguimiento(base({ eventos: [{ tipo: "cancelado", creado_en: hace(5) }] }, "cancelado")).ok).toBe(true);
    expect(calcularSeguimiento(base({ eventos: [] }, "cancelado"))).toEqual({ ok: false, motivo: "caducado" });
    expect(calcularSeguimiento(base({}, "subcontratado"))).toEqual({ ok: false, motivo: "caducado" });
  });
});

describe("idiomaPreferido", () => {
  test("Accept-Language", () => {
    expect(idiomaPreferido("en-GB,en;q=0.9")).toBe("en");
    expect(idiomaPreferido("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(idiomaPreferido("de-DE,en;q=0.5")).toBe("en");
    expect(idiomaPreferido("fr;q=0.9, es;q=0.3, en;q=0.6")).toBe("en");
    expect(idiomaPreferido("ca")).toBe("es");
    expect(idiomaPreferido("")).toBe("es");
    expect(idiomaPreferido(null)).toBe("es");
  });
  test("token", () => {
    expect(esTokenSeguimiento("a".repeat(43))).toBe(true);
    expect(esTokenSeguimiento("corto")).toBe(false);
    expect(esTokenSeguimiento("a".repeat(40) + "/..")).toBe(false);
  });
});
