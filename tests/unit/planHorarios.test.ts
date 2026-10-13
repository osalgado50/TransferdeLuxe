import { describe, expect, test } from "vitest";
import { agruparHorarios, tramosDelDia as tdd, type HorarioConductor, type Tramo } from "@/lib/dominio/horarios";

/** tramosDelDia con los tramos siempre presentes (para las comprobaciones). */
const tramosDelDia = (h: HorarioConductor | undefined, f: string, o?: { sinCambios?: boolean }) => {
  const d = tdd(h, f, o);
  return { ...d, tramos: d.restringido ? d.tramos : null };
};
import {
  conPlan, diasDelMes, mesAnterior, mesesEntre, mesSiguiente, nombreMes, origenCopiaMes, planCopiarMes, planCopiarMeses, planRepetirSemanas,
  planSemana, solapesVehiculoFechas,
} from "@/lib/dominio/planHorarios";

const t = (inicio: string, fin: string): Tramo => ({ inicio, fin });
const MANANA = [t("06:00", "14:00")], TARDE = [t("14:00", "22:00")], NOCHE = [t("22:00", "06:00")];
/** Semana tipo L–V de mañanas con la furgo v1; fin de semana libre. */
const tipo = (): HorarioConductor => ({
  semana: [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos: MANANA, vehiculo_id: "v1" as string | null }))
    .concat([6, 7].map((d) => ({ dia_semana: d, tramos: [], vehiculo_id: null }))),
  excepciones: [],
});

describe("meses", () => {
  test("siguiente, anterior, días, rango y nombre", () => {
    expect(mesSiguiente("2026-10")).toBe("2026-11");
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesAnterior("2027-01")).toBe("2026-12");
    expect(diasDelMes("2026-10")).toHaveLength(31);
    expect(diasDelMes("2027-02")).toHaveLength(28);
    expect(diasDelMes("2028-02").at(-1)).toBe("2028-02-29");
    expect(mesesEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(nombreMes("2026-10")).toMatch(/octubre/);
  });
  test("origen de la copia: mismo día de la semana, 4 semanas antes (5 si aún cae en el mes nuevo)", () => {
    expect(origenCopiaMes("2026-11-01")).toBe("2026-10-04"); // domingo ← domingo
    expect(origenCopiaMes("2026-11-28")).toBe("2026-10-31");
    expect(origenCopiaMes("2026-11-29")).toBe("2026-10-25");
    expect(origenCopiaMes("2026-11-30")).toBe("2026-10-26"); // lunes ← lunes
    for (const d of diasDelMes("2026-11")) {
      const o = origenCopiaMes(d);
      expect(o.startsWith("2026-10")).toBe(true);
      expect(new Date(`${o}T12:00:00Z`).getUTCDay()).toBe(new Date(`${d}T12:00:00Z`).getUTCDay());
    }
    for (const d of diasDelMes("2027-03")) expect(origenCopiaMes(d).startsWith("2027-02")).toBe(true);
  });
});

describe("planificación por fechas", () => {
  test("un día planificado manda sobre la semana tipo y trae su vehículo; sin vehículo, el de la semana tipo", () => {
    const h = agruparHorarios(
      [{ conductor_id: "a", dia_semana: 1, tramos: MANANA, vehiculo_id: "v1" }],
      [{ conductor_id: "a", fecha: "2026-10-19", tramos: TARDE, vehiculo_id: "v2", tipo: "plan" },
        { conductor_id: "a", fecha: "2026-10-26", tramos: TARDE, tipo: "plan" },
        { conductor_id: "a", fecha: "2026-11-02", tramos: [], nota: "Médico" }],
    ).get("a");
    expect(tramosDelDia(h, "2026-10-19")).toMatchObject({ tramos: TARDE, fuente: "plan", vehiculoId: "v2" });
    expect(tramosDelDia(h, "2026-10-26")).toMatchObject({ tramos: TARDE, fuente: "plan", vehiculoId: "v1" });
    expect(tramosDelDia(h, "2026-11-02")).toMatchObject({ tramos: [], fuente: "excepcion" }); // cambio puntual (filas antiguas)
    expect(tramosDelDia(h, "2026-11-02", { sinCambios: true })).toMatchObject({ tramos: MANANA, fuente: "semanal" });
    expect(tramosDelDia(h, "2026-11-09")).toMatchObject({ tramos: MANANA, fuente: "semanal" });
  });

  test("planificar solo una semana: los 7 días con fecha, la siguiente sigue con la semana tipo", () => {
    const dias = planSemana("2026-10-19", [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dia_semana: d, tramos: d <= 5 ? TARDE : [], vehiculo_id: "v3" })));
    expect(dias.map((d) => d.fecha)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    const h = conPlan(tipo(), dias);
    expect(tramosDelDia(h, "2026-10-21").tramos).toEqual(TARDE);
    expect(tramosDelDia(h, "2026-10-28").tramos).toEqual(MANANA); // la semana siguiente no cambia
    expect(tramosDelDia(h, "2026-10-14").tramos).toEqual(MANANA); // ni la anterior
  });

  test("copiar el mes al siguiente: mismo día de la semana, con vehículo; sin pisar los cambios puntuales", () => {
    // Octubre: semana del 19 de tardes (plan) y el resto de la semana tipo. Cambio puntual el 16/11.
    const h = conPlan(tipo(), planSemana("2026-10-19", [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos: TARDE, vehiculo_id: "v2" }))));
    h.excepciones.push({ fecha: "2026-11-16", tramos: [], nota: "Médico", tipo: "cambio" });
    const nov = planCopiarMes(h, "2026-10");
    expect(nov.every((d) => d.fecha.startsWith("2026-11"))).toBe(true);
    expect(nov.find((d) => d.fecha === "2026-11-16")).toBeUndefined(); // el cambio puntual se respeta
    expect(nov).toHaveLength(29);
    expect(nov.find((d) => d.fecha === "2026-11-17")).toEqual({ fecha: "2026-11-17", tramos: TARDE, vehiculo_id: "v2" }); // ← martes 20/10
    expect(nov.find((d) => d.fecha === "2026-11-24")).toEqual({ fecha: "2026-11-24", tramos: MANANA, vehiculo_id: "v1" }); // ← martes 27/10
    expect(nov.find((d) => d.fecha === "2026-11-07")).toEqual({ fecha: "2026-11-07", tramos: [], vehiculo_id: null }); // sábado libre
  });

  test("un cambio puntual del mes origen no se copia: se copia lo que había debajo", () => {
    const h = tipo();
    h.excepciones.push({ fecha: "2026-10-20", tramos: [], nota: "Médico", tipo: "cambio" });
    expect(planCopiarMes(h, "2026-10").find((d) => d.fecha === "2026-11-17")?.tramos).toEqual(MANANA);
  });

  test("sin horario no se copia nada (sigue disponible todo el día)", () => {
    expect(planCopiarMes(undefined, "2026-10")).toEqual([]);
    expect(planCopiarMes({ semana: [], excepciones: [] }, "2026-10")).toEqual([]);
  });

  test("copiar a varios meses encadenando (hasta diciembre) y todo el año siguiente", () => {
    const h = conPlan(tipo(), planSemana("2026-10-19", [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos: NOCHE, vehiculo_id: "v2" }))));
    const dias = planCopiarMeses(h, "2026-10", "2026-12");
    expect(dias[0].fecha).toBe("2026-11-01");
    expect(dias.at(-1)?.fecha).toBe("2026-12-31");
    expect(dias).toHaveLength(30 + 31);
    const dic = conPlan(h, dias);
    expect(tramosDelDia(dic, "2026-12-15").tramos).toEqual(NOCHE); // 20/10 → 17/11 → 15/12
    expect(planCopiarMeses(h, "2026-10", "2027-12")).toHaveLength(61 + 365);
    expect(planCopiarMeses(h, "2026-10", "2026-10")).toEqual([]);
  });

  test("repetir un bloque de 2 semanas (mañanas / tardes) hasta una fecha: rotación", () => {
    const h = conPlan(tipo(), [
      ...planSemana("2026-10-19", [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos: MANANA, vehiculo_id: "v1" }))),
      ...planSemana("2026-10-26", [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos: TARDE, vehiculo_id: "v1" }))),
    ]);
    h.excepciones.push({ fecha: "2026-11-10", tramos: [], nota: "Médico", tipo: "cambio" });
    const dias = planRepetirSemanas(h, "2026-10-19", 2, "2026-12-31");
    expect(dias[0].fecha).toBe("2026-11-02");
    expect(dias.at(-1)?.fecha).toBe("2026-12-31");
    expect(dias.find((d) => d.fecha === "2026-11-10")).toBeUndefined(); // cambio puntual respetado
    const r = conPlan(h, dias);
    expect(tramosDelDia(r, "2026-11-03").tramos).toEqual(MANANA);
    expect(tramosDelDia(r, "2026-11-11").tramos).toEqual(TARDE);
    expect(tramosDelDia(r, "2026-11-17").tramos).toEqual(MANANA);
    expect(tramosDelDia(r, "2026-12-22").tramos).toEqual(TARDE); // 9 semanas después del 20/10: semana impar → tardes
    expect(tramosDelDia(r, "2026-11-07").tramos).toEqual([]); // sábados libres
    expect(planRepetirSemanas(h, "2026-10-19", 2, "2026-10-30")).toEqual([]); // hasta antes del final del bloque: nada
  });
});

describe("vehículo compartido por fechas", () => {
  const h = (tramos: Tramo[], vehiculo: string | null, fecha = "2026-10-20"): HorarioConductor =>
    ({ semana: [], excepciones: [{ fecha, tramos, vehiculo_id: vehiculo, tipo: "plan" }] });
  test("choque a la vez; relevo en la base no; distinto vehículo no; madrugada del turno de noche sí", () => {
    const f = ["2026-10-20", "2026-10-21"];
    expect(solapesVehiculoFechas(new Map([["a", h(MANANA, "v1")], ["b", h(TARDE, "v1")]]), f)).toEqual([]);
    expect(solapesVehiculoFechas(new Map([["a", h(MANANA, "v1")], ["b", h([t("13:00", "20:00")], "v1")]]), f))
      .toMatchObject([{ fecha: "2026-10-20", vehiculoId: "v1", a: "a", b: "b" }]);
    expect(solapesVehiculoFechas(new Map([["a", h(MANANA, "v1")], ["b", h([t("13:00", "20:00")], "v2")]]), f)).toEqual([]);
    expect(solapesVehiculoFechas(new Map([["a", h(NOCHE, "v1")], ["b", h([t("05:00", "13:00")], "v1", "2026-10-21")]]), f))
      .toMatchObject([{ fecha: "2026-10-21", a: "a", b: "b" }]);
  });
});
