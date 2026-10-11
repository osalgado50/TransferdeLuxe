import { describe, expect, it } from "vitest";
import {
  calcularRecorrido, douglasPeucker, filtrarPosiciones, kmDe, necesitaRecalculo, proyectarRecorrido, textoDuracion, textoKm,
  tramosRecorrido, ventanaRecorrido, type PosicionGps, type PuntoLngLat,
} from "@/lib/dominio/recorrido";

const T0 = Date.parse("2026-10-11T10:00:00Z");
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();
// Salou (41.076, 1.14) → Aeropuerto de Reus (41.1474, 1.1672): ~8,2 km en línea recta.
const SALOU = { lat: 41.076, lng: 1.14 }, REUS = { lat: 41.1474, lng: 1.1672 };
/** n posiciones en línea recta entre a y b, una cada `cada` s desde el segundo `desde`. */
function linea(a: { lat: number; lng: number }, b: { lat: number; lng: number }, n: number, desde = 0, cada = 10): PosicionGps[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: a.lat + ((b.lat - a.lat) * i) / (n - 1), lng: a.lng + ((b.lng - a.lng) * i) / (n - 1), precision_m: 8, registrado_en: iso(desde + i * cada),
  }));
}
const ev = (tipo: string, s: number) => ({ tipo, creado_en: iso(s) });

describe("ventanaRecorrido", () => {
  it("en camino → recogido → completado", () => {
    expect(ventanaRecorrido([ev("asignado", -100), ev("aceptado", -50), ev("en_camino", 0), ev("recogido", 600), ev("completado", 1200)]))
      .toEqual({ inicio: iso(0), recogido: iso(600), fin: iso(1200) });
  });
  it("sin «en camino» usa «aceptado»; sin completar no hay ventana", () => {
    expect(ventanaRecorrido([ev("aceptado", 0), ev("completado", 900)])).toEqual({ inicio: iso(0), recogido: null, fin: iso(900) });
    expect(ventanaRecorrido([ev("aceptado", 0), ev("en_camino", 10)])).toBeNull();
    expect(ventanaRecorrido([ev("completado", 10)])).toEqual({ inicio: iso(10), recogido: null, fin: iso(10) }); // completado a mano
  });
  it("deshecho y vuelto a completar: cuenta el último «completado»", () => {
    const v = ventanaRecorrido([ev("en_camino", 0), ev("recogido", 600), ev("completado", 900), ev("deshecho", 950), ev("completado", 1500)]);
    expect(v).toEqual({ inicio: iso(0), recogido: iso(600), fin: iso(1500) });
  });
});

describe("filtrarPosiciones", () => {
  it("descarta precisión > 100 m y ordena por hora", () => {
    const p = [{ ...SALOU, precision_m: 500, registrado_en: iso(5) }, { ...SALOU, precision_m: 10, registrado_en: iso(10) }, { ...SALOU, precision_m: null, registrado_en: iso(0) }];
    expect(filtrarPosiciones(p).map((x) => x.registrado_en)).toEqual([iso(0), iso(10)]);
  });
  it("descarta un salto imposible (> 200 km/h) en mitad del viaje", () => {
    const p = linea(SALOU, REUS, 20, 0, 30);
    p.splice(10, 0, { lat: 41.5, lng: 2.0, precision_m: 5, registrado_en: iso(9 * 30 + 15) }); // Barcelona 15 s después
    const f = filtrarPosiciones(p);
    expect(f).toHaveLength(20);
    expect(f.some((x) => x.lat === 41.5)).toBe(false);
  });
  it("si el primer punto era el raro, se recupera con los siguientes coherentes", () => {
    const p = [{ lat: 41.5, lng: 2.0, precision_m: 5, registrado_en: iso(0) }, ...linea(SALOU, REUS, 10, 10, 30)];
    const f = filtrarPosiciones(p);
    expect(f.some((x) => x.lat === 41.5)).toBe(false);
    expect(f).toHaveLength(10);
  });
  it("tolera el ruido de GPS con horas muy juntas", () => {
    const p = [{ ...SALOU, precision_m: 5, registrado_en: iso(0) }, { lat: SALOU.lat + 0.0002, lng: SALOU.lng, precision_m: 5, registrado_en: iso(0.2) }];
    expect(filtrarPosiciones(p)).toHaveLength(2);
  });
});

describe("douglasPeucker", () => {
  it("una recta con muchos puntos queda en sus dos extremos", () => {
    const pts = linea(SALOU, REUS, 200).map((p) => [p.lng, p.lat] as PuntoLngLat);
    expect(douglasPeucker(pts, 15)).toEqual([pts[0], pts[199]]);
  });
  it("conserva una esquina que se aparta más de la tolerancia", () => {
    const pts: PuntoLngLat[] = [[1.14, 41.076], [1.145, 41.076], [1.15, 41.076], [1.15, 41.08], [1.15, 41.085]];
    expect(douglasPeucker(pts, 15)).toEqual([[1.14, 41.076], [1.15, 41.076], [1.15, 41.085]]);
  });
});

describe("calcularRecorrido", () => {
  const eventos = [ev("aceptado", -60), ev("en_camino", 0), ev("recogido", 600), ev("completado", 1500)];
  it("Salou → Reus: km plausibles, duración y corte en la recogida", () => {
    // Hacia la recogida: 60 puntos en Salou por calles (zig-zag pequeño); luego Salou → Reus.
    const hacia = linea({ lat: 41.07, lng: 1.13 }, SALOU, 60, 0, 10);
    const con = linea(SALOU, REUS, 90, 600, 10);
    const r = calcularRecorrido([...hacia, ...con, { ...REUS, precision_m: 5, registrado_en: iso(5000) }], eventos)!;
    expect(r.duracion_min).toBe(25);
    expect(r.puntos_originales).toBe(150); // la posición de fuera de la ventana no cuenta
    expect(r.km).toBeGreaterThan(9);
    expect(r.km).toBeLessThan(10.5);
    expect(r.km_con_pasajeros).toBeGreaterThan(8);
    expect(r.puntos.length).toBeLessThanOrEqual(4);
    expect(r.corte).not.toBeNull();
    expect(r.puntos[r.corte!]).toEqual([SALOU.lng, SALOU.lat]);
    expect(r.puntos.at(-1)).toEqual([REUS.lng, REUS.lat]);
  });
  it("respeta el máximo de puntos subiendo la tolerancia", () => {
    // Carretera de curvas: 2000 puntos (uno cada 5 s), ~16 curvas de 800 m de amplitud.
    const curvas: PosicionGps[] = Array.from({ length: 2000 }, (_, i) => ({
      lat: 41.07 + i * 0.00003, lng: 1.13 + 0.01 * Math.sin(i / 20), precision_m: 5, registrado_en: iso(i * 5),
    }));
    expect(calcularRecorrido(curvas, [ev("en_camino", 0), ev("completado", 10000)])!.puntos.length).toBeGreaterThan(60);
    const r = calcularRecorrido(curvas, [ev("en_camino", 0), ev("completado", 10000)], { maxPuntos: 40 })!;
    expect(r.puntos.length).toBeLessThanOrEqual(40);
    expect(r.puntos.length).toBeGreaterThan(2);
    expect(r.corte).toBeNull();
    expect(r.km_con_pasajeros).toBeNull();
  });
  it("sin posiciones: recorrido vacío (no se reintenta en bucle); sin completar: null", () => {
    expect(calcularRecorrido([], eventos)).toMatchObject({ puntos: [], km: 0, puntos_originales: 0, duracion_min: 25 });
    expect(calcularRecorrido(linea(SALOU, REUS, 5), [ev("en_camino", 0)])).toBeNull();
  });
});

describe("tramos, recálculo y proyección", () => {
  const pts: PuntoLngLat[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  it("tramosRecorrido comparte el punto de recogida", () => {
    expect(tramosRecorrido(pts, 1)).toEqual({ hacia: [[0, 0], [1, 0]], con: [[1, 0], [2, 0], [3, 0]] });
    expect(tramosRecorrido(pts, null)).toEqual({ hacia: pts, con: [] });
    expect(tramosRecorrido(pts, 99).hacia).toEqual(pts);
  });
  it("necesitaRecalculo", () => {
    const fin = iso(1000);
    expect(necesitaRecalculo(fin, null, T0)).toBe(true);
    expect(necesitaRecalculo(iso(2000), { fin, calculado_en: iso(1010) }, T0 + 1e6)).toBe(true); // se volvió a completar
    expect(necesitaRecalculo(fin, { fin, calculado_en: iso(1010) }, T0 + 1060e3)).toBe(false); // hace 50 s
    expect(necesitaRecalculo(fin, { fin, calculado_en: iso(1010) }, T0 + 1200e3)).toBe(true); // hace > 2 min, dentro de los 15
    expect(necesitaRecalculo(fin, { fin, calculado_en: iso(1000 + 16 * 60) }, T0 + 1e7)).toBe(false); // definitivo
  });
  it("proyectarRecorrido encaja en la caja y el norte queda arriba", () => {
    const xy = proyectarRecorrido([[SALOU.lng, SALOU.lat], [REUS.lng, REUS.lat]], 120, 80);
    for (const [x, y] of xy) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(120); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(80); }
    expect(xy[1][1]).toBeLessThan(xy[0][1]); // Reus (más al norte) más arriba
    expect(proyectarRecorrido([], 10, 10)).toEqual([]);
  });
  it("textos y km", () => {
    expect(textoKm(12.345)).toBe("12,3 km");
    expect(textoDuracion(25)).toBe("25 min");
    expect(textoDuracion(83)).toBe("1 h 23 min");
    expect(kmDe([SALOU, REUS])).toBeCloseTo(8.2, 0);
  });
});
