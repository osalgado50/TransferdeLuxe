import { describe, expect, test } from "vitest";
import {
  auditarPropuesta, colorMargen, comprobar, esEstrategia, evaluarAsignacion, metricasRuta, problemaCapacidad, proponerAsignacion,
  ESTRATEGIAS, TRASLADO_DESCONOCIDO_MIN, type ConductorAuto, type EntradaAuto, type Estrategia, type ServicioAuto,
} from "@/lib/dominio/autoasignacion";
import { tiempoTraslado } from "@/lib/dominio/planificacion";

const salou = { lat: 41.0763, lng: 1.1416 };
const cambrils = { lat: 41.067, lng: 1.0597 };
const reus = { lat: 41.1474, lng: 1.1672 };
const tarragona = { lat: 41.1189, lng: 1.2445 };
const bcn = { lat: 41.2974, lng: 2.0833 };
const lleida = { lat: 41.6176, lng: 0.62 };

const T = (hhmm: string, dia = "2026-10-20") => Date.parse(`${dia}T${hhmm}:00+02:00`);
const AHORA = T("06:00");
const sv = (id: string, hora: string, dur = 30, origen: ServicioAuto["origen"] = salou, destino: ServicioAuto["destino"] = salou, pax = 2, maletas = 2): ServicioAuto =>
  ({ id, inicio: T(hora), duracionMin: dur, pasajeros: pax, maletas, origen, destino });
const veh = (plazas = 7, estado: "activo" | "taller" = "activo") => ({ id: `v${plazas}${estado}`, plazas, maletas: plazas, estado });
const cond = (id: string, o: Partial<ConductorAuto> = {}): ConductorAuto => ({ id, nombre: id.toUpperCase(), vehiculo: veh(), compromisos: [], ...o });
const entrada = (servicios: ServicioAuto[], conductores: ConductorAuto[], estrategia: Estrategia = "equitativo", margenMinimoMin = 15): EntradaAuto =>
  ({ servicios, conductores, estrategia, margenMinimoMin, ahora: AHORA });
const quien = (p: ReturnType<typeof proponerAsignacion>) => Object.fromEntries(p.lineas.map((l) => [l.servicioId, l.conductorId]));
const cuenta = (p: ReturnType<typeof proponerAsignacion>, cid: string) => p.lineas.filter((l) => l.conductorId === cid).length;

/** Generador pseudoaleatorio determinista (LCG) para escenarios grandes. */
function lcg(semilla: number) { let x = semilla; return () => ((x = (x * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32); }
const PUNTOS = [salou, cambrils, reus, tarragona, bcn];

describe("básico", () => {
  test("estrategias y validación", () => {
    expect(ESTRATEGIAS.map((e) => e.clave)).toEqual(["equitativo", "menos_km", "equilibrado"]);
    expect(esEstrategia("menos_km")).toBe(true);
    expect(esEstrategia("otra")).toBe(false);
  });
  test("sin servicios: sin líneas y métricas por conductor", () => {
    const p = proponerAsignacion(entrada([], [cond("a"), cond("b")]));
    expect(p.lineas).toEqual([]);
    expect(p.metricas.map((m) => m.conductorId)).toEqual(["a", "b"]);
    expect(p.metricas[0]).toMatchObject({ servicios: 0, nuevos: 0, horas: 0, kmVacio: 0 });
  });
  test("sin conductores: nadie puede", () => {
    const p = proponerAsignacion(entrada([sv("s", "10:00")], []));
    expect(p.lineas[0].conductorId).toBeNull();
    expect(p.lineas[0].motivoSiNo).toMatch(/subcontratar|No hay conductores/);
  });
  test("un servicio y un conductor: asignado sin margen calculable", () => {
    const p = proponerAsignacion(entrada([sv("s", "10:00")], [cond("a")]));
    expect(p.lineas[0]).toMatchObject({ servicioId: "s", conductorId: "a", ok: true, grave: false, motivoSiNo: null, llegadaEstimada: null, margenMin: null });
  });
  test("líneas ordenadas por hora aunque la entrada venga desordenada", () => {
    const p = proponerAsignacion(entrada([sv("c", "12:00"), sv("a", "08:00"), sv("b", "10:00")], [cond("x")]));
    expect(p.lineas.map((l) => l.servicioId)).toEqual(["a", "b", "c"]);
  });
});

describe("capacidad y vehículo", () => {
  test("problemaCapacidad", () => {
    expect(problemaCapacidad({ vehiculo: null }, { pasajeros: 1, maletas: 0 })).toBe("Sin vehículo habitual");
    expect(problemaCapacidad({ vehiculo: veh(7, "taller") }, { pasajeros: 1, maletas: 0 })).toBe("Vehículo en taller");
    expect(problemaCapacidad({ vehiculo: veh(3) }, { pasajeros: 4, maletas: 0 })).toBe("Vehículo de 3 plazas (necesita 4)");
    expect(problemaCapacidad({ vehiculo: { id: "v", plazas: 7, maletas: 2, estado: "activo" } }, { pasajeros: 2, maletas: 5 })).toBe("Vehículo con 2 maletas (necesita 5)");
    expect(problemaCapacidad({ vehiculo: veh(7) }, { pasajeros: 7, maletas: 7 })).toBeNull();
  });
  test("grupo grande va al vehículo que cabe", () => {
    const p = proponerAsignacion(entrada([sv("g", "10:00", 30, salou, salou, 8, 8)], [cond("a", { vehiculo: veh(3) }), cond("b", { vehiculo: veh(13) })]));
    expect(quien(p).g).toBe("b");
  });
  test("grupo mayor que las plazas de todos → subcontratar", () => {
    const p = proponerAsignacion(entrada([sv("g", "10:00", 30, salou, salou, 15, 4)], [cond("a", { vehiculo: veh(7) }), cond("b", { vehiculo: veh(13) })]));
    expect(p.lineas[0]).toMatchObject({ conductorId: null, subcontratar: true });
    expect(p.lineas[0].motivoSiNo).toMatch(/15 pax.*subcontratar/);
  });
  test("vehículo en taller no cuenta (ni para subcontratar)", () => {
    const p = proponerAsignacion(entrada([sv("s", "10:00", 30, salou, salou, 10, 2)], [cond("a", { vehiculo: veh(13, "taller") }), cond("b", { vehiculo: veh(7) })]));
    expect(p.lineas[0].subcontratar).toBe(true);
    const q = proponerAsignacion(entrada([sv("s", "10:00")], [cond("a", { vehiculo: veh(7, "taller") }), cond("b")]));
    expect(quien(q).s).toBe("b");
  });
  test("sin vehículo habitual no recibe servicios", () => {
    const p = proponerAsignacion(entrada([sv("s", "10:00"), sv("t", "14:00")], [cond("a", { vehiculo: null }), cond("b")]));
    expect(cuenta(p, "a")).toBe(0);
    expect(cuenta(p, "b")).toBe(2);
  });
});

describe("factibilidad", () => {
  test("solape con un compromiso → al otro conductor", () => {
    const p = proponerAsignacion(entrada([sv("s", "10:00")], [cond("a", { compromisos: [sv("fijo", "09:45", 60)] }), cond("b", { compromisos: [sv("f2", "07:00")] })]));
    expect(quien(p).s).toBe("b");
  });
  test("dos a la misma hora con dos conductores: uno cada uno", () => {
    const p = proponerAsignacion(entrada([sv("s1", "10:00"), sv("s2", "10:00")], [cond("a"), cond("b")]));
    expect(new Set(Object.values(quien(p)))).toEqual(new Set(["a", "b"]));
  });
  test("tres a la misma hora con dos conductores: uno queda fuera con motivo", () => {
    const p = proponerAsignacion(entrada([sv("s1", "10:00"), sv("s2", "10:00"), sv("s3", "10:00")], [cond("a"), cond("b")]));
    const fuera = p.lineas.filter((l) => !l.conductorId);
    expect(fuera).toHaveLength(1);
    expect(fuera[0].motivoSiNo).toMatch(/^Ningún conductor puede — A: Ocupado de 10:00 a 10:30 · B: Ocupado de 10:00 a 10:30$/);
    expect(fuera[0].subcontratar).toBe(false);
  });
  test("margen mínimo desde el fin del anterior (mismo sitio: traslado 0)", () => {
    const a = cond("a", { compromisos: [sv("fijo", "09:30", 30)] }); // termina 10:00 en Salou
    expect(proponerAsignacion(entrada([sv("s", "10:10")], [a])).lineas[0].conductorId).toBeNull();
    const ok = proponerAsignacion(entrada([sv("s", "10:10")], [a], "equitativo", 5)).lineas[0];
    expect(ok).toMatchObject({ conductorId: "a", margenAntesMin: 10, llegadaEstimada: T("10:00"), ok: true });
    const justo = proponerAsignacion(entrada([sv("s", "10:15")], [a])).lineas[0];
    expect(justo).toMatchObject({ conductorId: "a", margenAntesMin: 15 });
  });
  test("el traslado cuenta: Barcelona → Salou necesita ~1,5 h", () => {
    const a = cond("a", { compromisos: [sv("fijo", "08:00", 60, reus, bcn)] }); // termina 09:00 en BCN
    const tr = tiempoTraslado(bcn, salou)!;
    expect(proponerAsignacion(entrada([sv("s", "10:00")], [a])).lineas[0].conductorId).toBeNull();
    const hora = new Date(T("09:00") + (tr + 20) * 60_000);
    const hhmm = hora.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
    const l = proponerAsignacion(entrada([sv("s", hhmm)], [a])).lineas[0];
    expect(l.conductorId).toBe("a");
    expect(l.margenAntesMin).toBeGreaterThanOrEqual(15);
    expect(l.kmVacio).toBeGreaterThan(100);
  });
  test("no rompe el siguiente compromiso", () => {
    const a = cond("a", { compromisos: [sv("fijo", "11:00", 30, bcn, bcn)] });
    // 10:00 Salou→Salou 30 min: termina 10:30 y a BCN se tarda ~1,5 h → no llega a las 11:00.
    const p = proponerAsignacion(entrada([sv("s", "10:00")], [a]));
    expect(p.lineas[0].conductorId).toBeNull();
    expect(p.lineas[0].motivoSiNo).toMatch(/No llegaría a su servicio de las 11:00/);
  });
  test("margen después por debajo del mínimo (sin llegar a 0) también descarta", () => {
    const a = cond("a", { compromisos: [sv("fijo", "10:40", 30)] });
    const p = proponerAsignacion(entrada([sv("s", "10:00")], [a]));
    expect(p.lineas[0].motivoSiNo).toMatch(/Solo 10 min de margen hasta su servicio de las 10:40 \(mínimo 15\)/);
  });
  test("recogida ya pasada: no se asigna", () => {
    const p = proponerAsignacion(entrada([sv("s", "05:30")], [cond("a")]));
    expect(p.lineas[0]).toMatchObject({ conductorId: null });
    expect(p.lineas[0].motivoSiNo).toMatch(/ya pasó/);
  });
  test("posición actual: lejos y la recogida en 30 min → no llega; mañana sí", () => {
    const a = cond("a", { posicion: lleida });
    expect(proponerAsignacion(entrada([sv("s", "06:30")], [a])).lineas[0].conductorId).toBeNull();
    const l = proponerAsignacion(entrada([sv("s", "06:30", 30, salou, salou, 2, 2)].map((s) => ({ ...s, inicio: s.inicio + 86400e3 })), [a])).lineas[0];
    expect(l.conductorId).toBe("a");
    expect(l.llegadaEstimada).toBeNull();
    expect(l.kmVacio).toBeGreaterThan(80); // los km desde donde está sí cuentan
  });
  test("posición cercana con poco tiempo: llega con margen calculado", () => {
    const l = proponerAsignacion(entrada([sv("s", "06:40")], [cond("a", { posicion: cambrils })])).lineas[0];
    expect(l.conductorId).toBe("a");
    expect(l.llegadaEstimada).toBe(AHORA + tiempoTraslado(cambrils, salou)! * 60_000);
    expect(l.margenAntesMin).toBeGreaterThan(0);
  });
  test("sin coordenadas se supone un traslado de 30 min", () => {
    const a = cond("a", { compromisos: [sv("fijo", "09:00", 60, salou, null)] });
    const p = proponerAsignacion(entrada([sv("s", "10:20")], [a]));
    expect(p.lineas[0].conductorId).toBeNull(); // 10:00 + 30 = 10:30 > 10:20
    const q = proponerAsignacion(entrada([sv("s", "10:45")], [a])).lineas[0];
    expect(q).toMatchObject({ conductorId: "a", margenAntesMin: 45 - TRASLADO_DESCONOCIDO_MIN, kmVacio: null });
  });
  test("comprobar directo devuelve km delta e inserción entre dos", () => {
    const a = cond("a");
    const otros = [sv("x", "08:00", 30, reus, salou), sv("y", "12:00", 30, salou, reus)];
    const ch = comprobar(a, otros, sv("s", "10:00", 30, salou, salou), 15, AHORA);
    expect(ch.ok).toBe(true);
    expect(ch.kmDelta).toBeCloseTo(0, 5);
    const lejos = comprobar(a, otros, sv("s", "10:00", 30, tarragona, tarragona), 15, AHORA);
    expect(lejos.kmDelta).toBeGreaterThan(10);
  });
});

describe("estrategias", () => {
  const dia = (n: number) => Array.from({ length: n }, (_, i) => sv(`s${i}`, `${String(8 + i).padStart(2, "0")}:00`));
  test("equitativo reparte por igual", () => {
    const p = proponerAsignacion(entrada(dia(6), [cond("a"), cond("b"), cond("c")]));
    expect([cuenta(p, "a"), cuenta(p, "b"), cuenta(p, "c")]).toEqual([2, 2, 2]);
  });
  test("equitativo cuenta los servicios que ya tienen", () => {
    const a = cond("a", { compromisos: [sv("f1", "06:30", 20), sv("f2", "07:00", 20)] });
    const p = proponerAsignacion(entrada([sv("s1", "12:00"), sv("s2", "14:00")], [a, cond("b")]));
    expect(cuenta(p, "b")).toBe(2);
    expect(p.metricas.find((m) => m.conductorId === "a")).toMatchObject({ servicios: 2, nuevos: 0 });
    expect(p.metricas.find((m) => m.conductorId === "b")).toMatchObject({ servicios: 2, nuevos: 2 });
  });
  test("menos_km: encadena con quien termina cerca", () => {
    const a = cond("a", { compromisos: [sv("fa", "07:00", 60, reus, salou)] });
    const b = cond("b", { compromisos: [sv("fb", "07:00", 60, reus, bcn)] });
    const servicios = [sv("s1", "10:00", 30, salou, cambrils), sv("s2", "12:00", 30, cambrils, salou), sv("s3", "14:00", 30, salou, salou)];
    const km = proponerAsignacion(entrada(servicios, [a, b], "menos_km"));
    expect(Object.values(quien(km))).toEqual(["a", "a", "a"]);
    const eq = proponerAsignacion(entrada(servicios, [a, b], "equitativo"));
    expect(cuenta(eq, "b")).toBeGreaterThanOrEqual(1);
    const kmTotal = (p: typeof km) => p.metricas.reduce((t, m) => t + m.kmVacio, 0);
    expect(kmTotal(km)).toBeLessThan(kmTotal(eq));
  });
  test("equilibrado: menos km pero nadie con más del doble que el que menos", () => {
    const a = cond("a", { posicion: salou });
    const b = cond("b", { posicion: bcn });
    const servicios = Array.from({ length: 6 }, (_, i) => sv(`s${i}`, `${String(9 + i * 2).padStart(2, "0")}:00`, 30, salou, salou));
    const km = proponerAsignacion(entrada(servicios, [a, b], "menos_km"));
    expect(cuenta(km, "a")).toBe(6);
    const eq = proponerAsignacion(entrada(servicios, [a, b], "equilibrado"));
    const [na, nb] = [cuenta(eq, "a"), cuenta(eq, "b")];
    expect(na + nb).toBe(6);
    expect(Math.max(na, nb)).toBeLessThanOrEqual(2 * Math.max(1, Math.min(na, nb)));
    expect(na).toBeGreaterThanOrEqual(nb); // con empate de km, al que está cerca o al que menos lleva
  });
  test("la mejora local deja al equitativo con diferencia ≤ 1 cuando todo cabe", () => {
    const rnd = lcg(7);
    const servicios = Array.from({ length: 9 }, (_, i) => {
      const o = PUNTOS[Math.floor(rnd() * 4)], d = PUNTOS[Math.floor(rnd() * 4)];
      return { ...sv(`s${i}`, "07:00", 20, o, d), inicio: T("07:00") + i * 90 * 60_000 };
    });
    const p = proponerAsignacion(entrada(servicios, [cond("a"), cond("b"), cond("c")]));
    const n = ["a", "b", "c"].map((c) => cuenta(p, c));
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1);
  });
});

describe("determinismo y auditoría", () => {
  function escenario(semilla: number, nServ: number, nCond: number) {
    const rnd = lcg(semilla);
    const servicios = Array.from({ length: nServ }, (_, i) => {
      const o = PUNTOS[Math.floor(rnd() * PUNTOS.length)], d = PUNTOS[Math.floor(rnd() * PUNTOS.length)];
      const ini = T("07:00") + Math.floor(rnd() * 14 * 60) * 60_000;
      return { id: `s${String(i).padStart(2, "0")}`, inicio: ini, duracionMin: 20 + Math.floor(rnd() * 70), pasajeros: 1 + Math.floor(rnd() * 9), maletas: Math.floor(rnd() * 6), origen: o, destino: d };
    });
    const conductores = Array.from({ length: nCond }, (_, i) => cond(`c${i}`, {
      vehiculo: veh([3, 7, 8, 13][i % 4], i === nCond - 1 ? "taller" : "activo"),
      compromisos: rnd() < 0.5 ? [{ id: `f${i}`, inicio: T("12:00") + Math.floor(rnd() * 120) * 60_000, duracionMin: 60, pasajeros: 1, maletas: 0, origen: PUNTOS[i % 5], destino: PUNTOS[(i + 1) % 5] }] : [],
      posicion: i % 2 ? PUNTOS[i % 5] : null,
    }));
    return { servicios, conductores };
  }
  for (const estrategia of ["equitativo", "menos_km", "equilibrado"] as Estrategia[]) {
    for (const semilla of [1, 2, 3]) {
      test(`${estrategia} · escenario ${semilla}: sin solapes, márgenes ≥ mínimo, capacidad y motivos`, () => {
        const { servicios, conductores } = escenario(semilla, 30, 6);
        const e = entrada(servicios, conductores, estrategia, 15);
        const p = proponerAsignacion(e);
        expect(auditarPropuesta(e, p)).toEqual([]);
        expect(p.lineas).toHaveLength(30);
        for (const l of p.lineas) {
          if (l.conductorId) { expect(l.ok).toBe(true); expect(l.margenMin == null || l.margenMin >= 15).toBe(true); }
          else expect(l.motivoSiNo).toBeTruthy();
        }
        expect(p.lineas.filter((l) => l.conductorId === "c5")).toEqual([]); // en taller
        if (estrategia === "equilibrado") {
          // El tope es blando (si nadie más puede, se asigna igual), pero nunca se desequilibra más que «menos km».
          const viol = (q: typeof p) => {
            const n = q.metricas.filter((m) => m.conductorId !== "c5").map((m) => m.servicios);
            return n.reduce((t, x) => t + Math.max(0, x - 2 * Math.max(1, Math.min(...n))), 0);
          };
          expect(viol(p)).toBeLessThanOrEqual(viol(proponerAsignacion({ ...e, estrategia: "menos_km" })));
        }
      });
    }
  }
  test("misma entrada en otro orden → misma propuesta", () => {
    const { servicios, conductores } = escenario(9, 20, 4);
    const a = proponerAsignacion(entrada(servicios, conductores));
    const b = proponerAsignacion(entrada([...servicios].reverse(), [...conductores].reverse()));
    expect(quien(b)).toEqual(quien(a));
  });
  test("auditoría detecta solapes y márgenes", () => {
    const e = entrada([sv("s1", "10:00"), sv("s2", "10:10")], [cond("a")]);
    const errores = auditarPropuesta(e, evaluarAsignacion(e, { s1: "a", s2: "a" }));
    expect(errores.some((x) => /solape/.test(x))).toBe(true);
  });
});

describe("cambio a mano (evaluarAsignacion)", () => {
  const e = entrada([sv("s1", "10:00"), sv("s2", "10:00"), sv("s3", "10:40")], [cond("a"), cond("b")]);
  test("la propuesta se reevalúa igual", () => {
    const p = proponerAsignacion(e);
    expect(evaluarAsignacion(e, quien(p)).lineas.map((l) => l.ok)).toEqual(p.lineas.map((l) => l.ok));
  });
  test("pasar a un conductor ocupado → línea en rojo (grave)", () => {
    const l = evaluarAsignacion(e, { s1: "a", s2: "a", s3: null }).lineas;
    expect(l[1]).toMatchObject({ conductorId: "a", ok: false, grave: true });
    expect(l[1].motivoSiNo).toMatch(/Ocupado/);
    expect(l[2]).toMatchObject({ conductorId: null, motivoSiNo: "Sin asignar" });
  });
  test("margen por debajo del mínimo → aviso no grave (naranja)", () => {
    const l = evaluarAsignacion(e, { s1: "a", s2: "b", s3: "a" }).lineas.find((x) => x.servicioId === "s3")!;
    expect(l).toMatchObject({ ok: false, grave: false, margenAntesMin: 10 });
    expect(colorMargen(l.margenMin, 15)).toBe("naranja");
  });
  test("conductor desconocido = sin asignar", () => {
    expect(evaluarAsignacion(e, { s1: "zzz" }).lineas[0].conductorId).toBeNull();
  });
  test("las métricas siguen la asignación", () => {
    const p = evaluarAsignacion(e, { s1: "a", s2: "b", s3: "b" });
    expect(p.metricas.map((m) => [m.conductorId, m.nuevos])).toEqual([["a", 1], ["b", 2]]);
  });
});

describe("métricas y semáforo", () => {
  test("metricasRuta: horas = servicio + traslados, km en vacío por carretera y compromisos fuera del día no cuentan", () => {
    const c = cond("a");
    const m = metricasRuta(c, [
      { ...sv("x", "08:00", 60, reus, salou), fijo: true },
      { ...sv("y", "10:00", 30, tarragona, reus), fijo: false },
      { ...sv("z", "23:30", 30, reus, reus, 1, 0), fijo: true, delDia: false },
    ]);
    expect(m.servicios).toBe(2);
    expect(m.nuevos).toBe(1);
    const tr = tiempoTraslado(salou, tarragona)! + tiempoTraslado(reus, reus)!;
    expect(m.horas).toBeCloseTo((60 + 30 + tr) / 60, 1);
    expect(m.kmVacio).toBeGreaterThan(10);
  });
  test("colorMargen", () => {
    expect(colorMargen(null, 15)).toBe("gris");
    expect(colorMargen(-1, 15)).toBe("rojo");
    expect(colorMargen(0, 15)).toBe("naranja");
    expect(colorMargen(14, 15)).toBe("naranja");
    expect(colorMargen(15, 15)).toBe("verde");
  });
});

describe("escala: tope de tiempo de la mejora (auditoría de estrés)", () => {
  test("300 servicios y 100 conductores: termina en pocos segundos y la propuesta sigue siendo válida", () => {
    const azar = lcg(42);
    const servicios = Array.from({ length: 300 }, (_, i) => {
      const h = 7 + Math.floor(azar() * 13), m = Math.floor(azar() * 4) * 15;
      return sv(`s${i}`, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, 30 + Math.floor(azar() * 40),
        PUNTOS[Math.floor(azar() * PUNTOS.length)], PUNTOS[Math.floor(azar() * PUNTOS.length)]);
    });
    const conductores = Array.from({ length: 100 }, (_, i) => cond(`c${String(i).padStart(3, "0")}`));
    const e = entrada(servicios, conductores);
    const t = Date.now();
    const p = proponerAsignacion(e);
    expect(Date.now() - t).toBeLessThan(8000); // antes ~35 s con el servidor bloqueado
    expect(auditarPropuesta(e, p)).toEqual([]);
    expect(p.lineas.filter((l) => l.conductorId).length).toBeGreaterThan(250);
  }, 30_000);
});
