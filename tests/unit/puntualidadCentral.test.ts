import { describe, expect, test } from "vitest";
import { gpsReciente, indicadoresPuntualidad, resumenIndicadores, COLOR_INDICADOR, type ServicioPuntualidad } from "@/lib/dominio/puntualidadCentral";
import { tiempoTraslado } from "@/lib/dominio/planificacion";

const salou = { lat: 41.0763, lng: 1.1416 };
const cambrils = { lat: 41.067, lng: 1.0597 };
const reus = { lat: 41.1474, lng: 1.1672 };
const bcn = { lat: 41.2974, lng: 2.0833 };
const T = (hhmm: string) => Date.parse(`2026-10-20T${hhmm}:00+02:00`);
const iso = (hhmm: string) => new Date(T(hhmm)).toISOString();
const AHORA = T("10:00");

const s = (id: string, hora: string, estado = "aceptado", o = salou, d = salou, cid = "c1", dur = 20): ServicioPuntualidad => ({
  id, estado, conductor_id: cid, fecha_hora_recogida: iso(hora), duracion_estimada_min: dur,
  origen_lat: o.lat, origen_lng: o.lng, destino_lat: d.lat, destino_lng: d.lng, origen_texto: "Origen", destino_texto: "Destino",
});
const pos = (p: { lat: number; lng: number }, haceMin = 1, en_servicio = true, cid = "c1") =>
  ({ conductor_id: cid, lat: p.lat, lng: p.lng, en_servicio, registrado_en: new Date(AHORA - haceMin * 60_000).toISOString() });
const calc = (servicios: ServicioPuntualidad[], posiciones = [pos(cambrils)], umbral = 5) =>
  indicadoresPuntualidad({ servicios, posiciones, ahora: AHORA, umbralGpsMin: umbral });

describe("gpsReciente", () => {
  test("solo en servicio y dentro del umbral", () => {
    expect(gpsReciente(pos(salou, 2), AHORA, 5)).toEqual(salou);
    expect(gpsReciente(pos(salou, 6), AHORA, 5)).toBeNull();
    expect(gpsReciente(pos(salou, 1, false), AHORA, 5)).toBeNull();
    expect(gpsReciente(undefined, AHORA, 5)).toBeNull();
  });
});

describe("con GPS", () => {
  test("a tiempo con margen", () => {
    const tr = tiempoTraslado(cambrils, salou)!;
    const r = calc([s("a", "10:40")]).a;
    expect(r).toMatchObject({ estado: "a_tiempo", conGps: true, margenMin: 40 - tr, retrasoMin: 0 });
    expect(r.texto).toBe(`a tiempo · ${40 - tr} min de margen`);
    expect(r.llegadaEstimada).toBe(new Date(AHORA + tr * 60_000).toISOString());
  });
  test("justo (< 5 min de margen)", () => {
    const tr = tiempoTraslado(cambrils, salou)!;
    const hora = new Date(AHORA + (tr + 3) * 60_000).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
    const r = calc([s("a", hora)]).a;
    expect(r.estado).toBe("justo");
    expect(r.texto).toBe("justo · 3 min");
  });
  test("retraso por ETA (desde Barcelona a Salou en 20 min)", () => {
    const r = calc([s("a", "10:20")], [pos(bcn)]).a;
    expect(r.estado).toBe("tarde");
    expect(r.retrasoMin).toBeGreaterThan(60);
    expect(r.texto).toMatch(/^retraso \+1 h \d\d min$/);
  });
  test("hora pasada y sin recoger → tarde", () => {
    const r = calc([s("a", "09:50", "en_camino")], [pos(salou)]).a;
    expect(r.estado).toBe("tarde");
    expect(r.retrasoMin).toBeGreaterThanOrEqual(10);
  });
  test("encadena: lleva pasajeros a Reus y después recoge en Salou", () => {
    const enCurso = s("x", "09:30", "recogido", salou, reus);
    const sig = s("a", "10:30", "aceptado", salou, salou);
    const r = calc([enCurso, sig], [pos(salou)]);
    expect(r.x).toBeUndefined(); // lo que va a bordo no lleva semáforo de recogida
    const llegaReus = tiempoTraslado(salou, reus)! + 15; // + descarga (esas coordenadas son el aeropuerto de Reus)
    const vuelta = tiempoTraslado(reus, salou)!;
    expect(r.a.margenMin).toBe(30 - llegaReus - vuelta);
  });
  test("el segundo servicio empieza cuando acaba el primero", () => {
    const r = calc([s("a", "10:30", "aceptado", salou, bcn, "c1", 90), s("b", "12:00", "asignado", salou, salou)], [pos(salou)]);
    expect(r.a.estado).toBe("a_tiempo");
    expect(r.b.estado).toBe("tarde"); // termina en BCN a las 12:00 y vuelve a Salou
  });
  test("pendientes, completados y sin conductor no cuentan", () => {
    const r = calc([s("p", "11:00", "pendiente"), s("c", "11:00", "completado"), { ...s("n", "11:00"), conductor_id: null }]);
    expect(r).toEqual({});
  });
});

describe("sin GPS reciente", () => {
  test("primer servicio sin GPS → gris «sin GPS»", () => {
    const r = calc([s("a", "11:00")], []).a;
    expect(r).toMatchObject({ estado: "sin_gps", texto: "sin GPS", conGps: false });
  });
  test("GPS viejo cuenta como sin GPS", () => {
    expect(calc([s("a", "11:00")], [pos(salou, 30)]).a.estado).toBe("sin_gps");
  });
  test("por plan: el siguiente servicio se calcula desde el fin previsto del anterior", () => {
    const r = calc([s("a", "11:00", "aceptado", salou, bcn, "c1", 90), s("b", "12:45", "asignado", salou, salou)], []);
    expect(r.a.estado).toBe("sin_gps");
    expect(r.b.conGps).toBe(false);
    expect(r.b.estado).toBe("tarde");
  });
  test("sin GPS y la hora ya pasó → tarde por reloj", () => {
    const r = calc([s("a", "09:45")], []).a;
    expect(r).toMatchObject({ estado: "tarde", retrasoMin: 15, texto: "retraso +15 min" });
  });
});

test("resumen y colores", () => {
  const r = calc([s("a", "10:20", "aceptado", salou, salou, "c1"), s("b", "12:00", "aceptado", salou, salou, "c2")], [pos(bcn), pos(salou, 1, true, "c2")]);
  expect(resumenIndicadores(Object.values(r))).toEqual({ tarde: 1, justo: 0 });
  expect(Object.keys(COLOR_INDICADOR)).toEqual(["a_tiempo", "justo", "tarde", "sin_gps"]);
});
