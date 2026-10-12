import { describe, expect, it } from "vitest";
import {
  ALTO_DIAGRAMA, ANCHO_DIAGRAMA, ZONAS_VEHICULO, alternarZona, cierreObligatorio, gravedadCierre, normalizarZonas, problemasCierre,
  resumenCierre, tecnicoInicial, ultimoCierrePorVehiculo, validarKm, type Tecnico,
} from "@/lib/dominio/cierre";
import { leerModulos } from "@/lib/dominio/modulos";

const T = (x: Partial<Tecnico> = {}): Tecnico => ({ ...tecnicoInicial(), ...x });

describe("diagrama del vehículo", () => {
  it("ids únicos y todas las zonas dentro de la rejilla", () => {
    expect(new Set(ZONAS_VEHICULO.map((z) => z.id)).size).toBe(ZONAS_VEHICULO.length);
    for (const z of ZONAS_VEHICULO) {
      expect(z.x >= 0 && z.y >= 0 && z.x + z.w <= ANCHO_DIAGRAMA && z.y + z.h <= ALTO_DIAGRAMA, z.id).toBe(true);
    }
  });
  it("las zonas no se solapan", () => {
    const solapa = (a: (typeof ZONAS_VEHICULO)[number], b: (typeof ZONAS_VEHICULO)[number]) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const a of ZONAS_VEHICULO) for (const b of ZONAS_VEHICULO) if (a !== b) expect(solapa(a, b), `${a.id}/${b.id}`).toBe(false);
  });
  it("zonas ≥ 40 pt en un móvil de 360 pt (rejilla escalada al ancho útil 340)", () => {
    const k = 340 / ANCHO_DIAGRAMA;
    for (const z of ZONAS_VEHICULO) expect(Math.min(z.w, z.h) * k, z.id).toBeGreaterThanOrEqual(40);
  });
  it("normaliza (sin repetidos ni ids inventados, en orden del diagrama) y alterna", () => {
    expect(normalizarZonas(["porton", "capo", "capo", "xx"])).toEqual(["capo", "porton"]);
    expect(alternarZona(["capo"], "porton")).toEqual(["capo", "porton"]);
    expect(alternarZona(["capo", "porton"], "capo")).toEqual(["porton"]);
  });
});

describe("gravedad del cierre", () => {
  it("ok si todo está bien", () => {
    expect(gravedadCierre({ zonas: [], tecnico: T(), combustible: "1_2" })).toBe("ok");
  });
  it("grave con daños, testigo encendido u otra avería", () => {
    expect(gravedadCierre({ zonas: ["capo"], tecnico: T(), combustible: "lleno" })).toBe("grave");
    expect(gravedadCierre({ zonas: [], tecnico: T({ testigos_cuadro: "revisar" }), combustible: "lleno" })).toBe("grave");
    expect(gravedadCierre({ zonas: [], tecnico: T({ otra_averia: "revisar" }), combustible: "lleno" })).toBe("grave");
    expect(gravedadCierre({ zonas: ["capo"], tecnico: T({ aceite: "falta" }), combustible: "reserva" })).toBe("grave");
  });
  it("mantenimiento: aceite/agua, neumáticos o luces, reserva", () => {
    for (const t of [T({ aceite: "falta" }), T({ refrigerante: "falta" }), T({ neumaticos: "revisar" }), T({ luces: "revisar" })]) {
      expect(gravedadCierre({ zonas: [], tecnico: t, combustible: "lleno" })).toBe("mantenimiento");
    }
    expect(gravedadCierre({ zonas: [], tecnico: T(), combustible: "reserva" })).toBe("mantenimiento");
  });
});

describe("resumen para la central", () => {
  it("grave con zonas y testigo", () => {
    expect(resumenCierre({ zonas: ["aleta_tras_der", "puerta_del_izq"], tecnico: T({ testigos_cuadro: "revisar", testigos: ["motor"] }), combustible: "lleno", matricula: "0001-TDL", conductor: "Marc" }))
      .toBe("🔴 Daños en Puerta del. izq., Aleta tras. der. · testigo de motor · 0001-TDL · Marc");
  });
  it("sin zonas: el primer problema va en mayúscula", () => {
    expect(resumenCierre({ zonas: [], tecnico: T({ testigos_cuadro: "revisar", testigos: ["motor", "inspeccion"] }), combustible: "lleno", matricula: "0002-TDL" }))
      .toBe("🔴 Testigos de motor y inspección · 0002-TDL");
    expect(resumenCierre({ zonas: [], tecnico: T({ aceite: "falta" }), combustible: "reserva", matricula: "0003-TDL", conductor: "Pau" }))
      .toBe("🟠 Falta aceite · combustible en reserva · 0003-TDL · Pau");
  });
  it("todo en verde", () => {
    expect(resumenCierre({ zonas: [], tecnico: T(), combustible: "3_4", matricula: "0001-TDL", conductor: "Laia" }))
      .toBe("🟢 Cierre sin incidencias · 0001-TDL · Laia");
  });
  it("testigo sin especificar", () => {
    expect(problemasCierre({ zonas: [], tecnico: T({ testigos_cuadro: "revisar" }), combustible: "lleno" })).toEqual(["testigo encendido"]);
  });
});

describe("km y módulos", () => {
  it("km opcional, entero y no menor que el actual", () => {
    expect(validarKm(null, 1000)).toEqual({ ok: true, km: null });
    expect(validarKm("", 1000)).toEqual({ ok: true, km: null });
    expect(validarKm(1500, 1000)).toEqual({ ok: true, km: 1500 });
    expect(validarKm("1.500", 1000)).toEqual({ ok: true, km: 1500 });
    expect(validarKm(1000, 1000)).toEqual({ ok: true, km: 1000 });
    expect(validarKm(999, 1000).ok).toBe(false);
    expect(validarKm(12.5, 0).ok).toBe(false);
    expect(validarKm(-1, 0).ok).toBe(false);
  });
  it("la hoja solo se pide con jornada, checklist y cierre activos (por defecto, sí)", () => {
    expect(cierreObligatorio(leerModulos(null))).toBe(true);
    expect(cierreObligatorio(leerModulos({ cierre: false }))).toBe(false);
    expect(cierreObligatorio(leerModulos({ checklist: false }))).toBe(false);
  });
  it("último cierre por vehículo", () => {
    const m = ultimoCierrePorVehiculo([
      { vehiculo_id: "a", creado_en: "2026-10-12T18:00:00Z", n: 1 },
      { vehiculo_id: "a", creado_en: "2026-10-12T20:00:00+00:00", n: 2 },
      { vehiculo_id: "b", creado_en: "2026-10-11T20:00:00Z", n: 3 },
    ]);
    expect(m.get("a")?.n).toBe(2);
    expect(m.get("b")?.n).toBe(3);
  });
});
