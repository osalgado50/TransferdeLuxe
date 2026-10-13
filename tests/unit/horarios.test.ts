import { describe, expect, test } from "vitest";
import {
  agruparHorarios, alertaFinTurno, esNocturno, intervalosDelDia, tramosPintadosDia, alertaFueraHorario, alertaSinJornada, cabeServicio, copiarATodos, diaSemana, enTurno, estadoTurno,
  fueraDeTurno, intervalo, leerTramos, lunesDeSemana, motivoAsignadoFueraHorario, preguntaAsignarFueraHorario, recordatoriosTurno,
  segmentosDia, solapeVehiculo, textoHorarioHoy, textoTramos, tipoJornada, tramosDelDia, turnoQueContiene, validarTramos, vehiculoDelTurno,
  type HorarioConductor, type Tramo,
} from "@/lib/dominio/horarios";
import { tiempoTraslado } from "@/lib/dominio/planificacion";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";
import { auditarPropuesta, comprobar, proponerAsignacion, type ConductorAuto, type ServicioAuto } from "@/lib/dominio/autoasignacion";

const MIN = 60_000;
/** Lunes 19/10/2026 (verano, UTC+2), sábado 24, domingo 25 (cambio de hora a las 03:00 → 02:00) y lunes 26 (invierno, UTC+1). */
const LUN = "2026-10-19", SAB = "2026-10-24", DOM = "2026-10-25", LUN2 = "2026-10-26";
const verano = (dia: string, h: string) => Date.parse(`${dia}T${h}:00+02:00`);
const invierno = (dia: string, h: string) => Date.parse(`${dia}T${h}:00+01:00`);
const t = (inicio: string, fin: string): Tramo => ({ inicio, fin });
const PARTIDO = [t("08:00", "13:00"), t("16:00", "20:00")];
const CONTINUO = [t("07:00", "15:00")];

/** Semana tipo: L–V partido, sábado continuo de mañana, domingo libre (fila con []). */
const semana = (tramos = PARTIDO, vehiculo: string | null = "v1"): HorarioConductor => ({
  semana: [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos, vehiculo_id: vehiculo })).concat([
    { dia_semana: 6, tramos: [t("06:00", "14:00")], vehiculo_id: "v2" }, { dia_semana: 7, tramos: [], vehiculo_id: null }]),
  excepciones: [],
});

const salou = { lat: 41.0763, lng: 1.1416 };
const reus = { lat: 41.1474, lng: 1.1672 };
const tarragona = { lat: 41.1189, lng: 1.2445 };
const barcelona = { lat: 41.3874, lng: 2.1686 };
const BASE = salou;

describe("tramos: validación y textos", () => {
  test("valida, ordena y rechaza solapes, horas mal escritas, tramos de duración cero y más de 4 tramos", () => {
    expect(validarTramos([t("16:00", "20:00"), t("08:00", "13:00")])).toEqual({ ok: true, tramos: PARTIDO });
    expect(validarTramos([])).toEqual({ ok: true, tramos: [] });
    expect(validarTramos([t("08:00", "24:00")]).ok).toBe(true);
    expect(validarTramos([t("8:00", "13:00")]).ok).toBe(false);
    expect(validarTramos([t("22:00", "02:00")])).toEqual({ ok: true, tramos: [t("22:00", "02:00")] }); // turno de noche
    expect(validarTramos([t("10:00", "10:00")])).toMatchObject({ ok: false, error: expect.stringMatching(/no dura nada/) });
    expect(validarTramos([t("08:00", "13:00"), t("12:30", "16:00")])).toMatchObject({ ok: false, error: expect.stringMatching(/solapan/) });
    expect(validarTramos([t("08:00", "13:00"), t("13:00", "16:00")]).ok).toBe(true); // contiguos: vale
    expect(validarTramos([t("01:00", "02:00"), t("03:00", "04:00"), t("05:00", "06:00"), t("07:00", "08:00"), t("09:00", "10:00")]).ok).toBe(false);
    expect(validarTramos("08:00").ok).toBe(false);
    expect(validarTramos([t("24:00", "24:00")]).ok).toBe(false);
  });
  test("leerTramos: tolera basura de la BD sin romper", () => {
    expect(leerTramos(null)).toEqual([]);
    expect(leerTramos([{ inicio: "16:00", fin: "20:00" }, { inicio: "x" }, { inicio: "08:00", fin: "13:00" }])).toEqual(PARTIDO);
    expect(leerTramos([{ inicio: "22:00", fin: "06:00" }])).toEqual([t("22:00", "06:00")]);
  });
  test("textos: partida, continua, libre", () => {
    expect(textoTramos(PARTIDO)).toBe("08:00–13:00 · 16:00–20:00");
    expect(textoTramos([])).toBe("Libre");
    expect(tipoJornada(PARTIDO)).toBe("Partida");
    expect(tipoJornada(CONTINUO)).toBe("Continua");
    expect(tipoJornada([])).toBe("Libre");
  });
  test("día de la semana ISO y lunes de la semana", () => {
    expect(diaSemana(LUN)).toBe(1);
    expect(diaSemana(SAB)).toBe(6);
    expect(diaSemana(DOM)).toBe(7);
    expect(lunesDeSemana(DOM)).toBe(LUN);
    expect(lunesDeSemana(LUN2)).toBe(LUN2);
  });
});

describe("tramosDelDia: excepción > semana tipo > sin restricción", () => {
  test("sin horario: sin restricción (compatibilidad)", () => {
    expect(tramosDelDia(null, LUN)).toEqual({ restringido: false, vehiculoId: null });
    expect(tramosDelDia({ semana: [], excepciones: [] }, LUN).restringido).toBe(false);
  });
  test("semana tipo: el día de la semana; domingo libre; día sin fila también libre", () => {
    const h = semana();
    expect(tramosDelDia(h, LUN)).toMatchObject({ restringido: true, tramos: PARTIDO, fuente: "semanal", vehiculoId: "v1" });
    expect(tramosDelDia(h, SAB)).toMatchObject({ tramos: [t("06:00", "14:00")], vehiculoId: "v2" });
    expect(tramosDelDia(h, DOM)).toMatchObject({ restringido: true, tramos: [] });
    const soloLunes: HorarioConductor = { semana: [{ dia_semana: 1, tramos: CONTINUO }], excepciones: [] };
    expect(tramosDelDia(soloLunes, "2026-10-20")).toMatchObject({ restringido: true, tramos: [] });
  });
  test("la excepción de un día manda (también para dejarlo libre) y conserva el vehículo de la semana", () => {
    const h = semana();
    h.excepciones.push({ fecha: LUN, tramos: [t("10:00", "18:00")], nota: "Cambio con Ana" }, { fecha: "2026-10-20", tramos: [] });
    expect(tramosDelDia(h, LUN)).toMatchObject({ fuente: "excepcion", tramos: [t("10:00", "18:00")], nota: "Cambio con Ana", vehiculoId: "v1" });
    expect(tramosDelDia(h, "2026-10-20")).toMatchObject({ fuente: "excepcion", tramos: [] });
    expect(tramosDelDia(h, "2026-10-21")).toMatchObject({ fuente: "semanal" });
  });
  test("solo una excepción (sin semana tipo): restringe ese día y el resto sigue libre de restricciones", () => {
    const h: HorarioConductor = { semana: [], excepciones: [{ fecha: LUN, tramos: CONTINUO }] };
    expect(tramosDelDia(h, LUN).restringido).toBe(true);
    expect(tramosDelDia(h, "2026-10-20").restringido).toBe(false);
  });
  test("vehículo del turno", () => {
    expect(vehiculoDelTurno(semana(), LUN)).toBe("v1");
    expect(vehiculoDelTurno(semana(), SAB)).toBe("v2");
    expect(vehiculoDelTurno(semana(), DOM)).toBeNull();
    expect(vehiculoDelTurno(null, LUN)).toBeNull();
  });
  test("agruparHorarios desde filas de la BD", () => {
    const m = agruparHorarios(
      [{ conductor_id: "a", dia_semana: 1, tramos: PARTIDO, vehiculo_id: "v1" }, { conductor_id: "b", dia_semana: 2, tramos: "basura" }],
      [{ conductor_id: "a", fecha: LUN, tramos: [], nota: "fiesta" }],
    );
    expect(m.get("a")!.semana[0]).toMatchObject({ dia_semana: 1, tramos: PARTIDO, vehiculo_id: "v1" });
    expect(m.get("a")!.excepciones[0]).toMatchObject({ fecha: LUN, tramos: [], nota: "fiesta" });
    expect(m.get("b")!.semana[0].tramos).toEqual([]);
    expect(m.has("c")).toBe(false);
  });
});

describe("hora de Madrid y cambio de hora (25/10/2026)", () => {
  test("verano UTC+2, invierno UTC+1", () => {
    expect(intervalo(LUN, t("08:00", "13:00"))).toMatchObject({ inicio: Date.parse("2026-10-19T06:00:00Z"), fin: Date.parse("2026-10-19T11:00:00Z") });
    expect(intervalo(LUN2, t("08:00", "13:00"))).toMatchObject({ inicio: Date.parse("2026-10-26T07:00:00Z"), fin: Date.parse("2026-10-26T12:00:00Z") });
  });
  test("el día del cambio un turno de 00:00 a 06:00 dura 7 h, y uno de 06:00 a 14:00 sigue durando 8 h", () => {
    const noche = intervalo(DOM, t("00:00", "06:00"));
    expect((noche.fin - noche.inicio) / 3600e3).toBe(7);
    expect(noche.inicio).toBe(Date.parse("2026-10-24T22:00:00Z"));
    expect(noche.fin).toBe(Date.parse("2026-10-25T05:00:00Z"));
    const dia = intervalo(DOM, t("06:00", "14:00"));
    expect((dia.fin - dia.inicio) / 3600e3).toBe(8);
  });
  test("«24:00» es la medianoche del día siguiente (también con el cambio de hora)", () => {
    const i = intervalo(SAB, t("18:00", "24:00"));
    expect(i.fin).toBe(Date.parse("2026-10-24T22:00:00Z"));
    const j = intervalo(DOM, t("18:00", "24:00"));
    expect(j.fin).toBe(Date.parse("2026-10-25T23:00:00Z"));
  });
  test("enTurno a ambos lados del cambio de hora", () => {
    const h: HorarioConductor = { semana: [6, 7, 1].map((d) => ({ dia_semana: d, tramos: [t("08:00", "13:00")] })), excepciones: [] };
    expect(enTurno(h, verano(SAB, "08:00"))).toBe(true);
    expect(enTurno(h, verano(SAB, "07:59"))).toBe(false);
    // Domingo 25 ya en invierno: 08:00 Madrid = 07:00 UTC; las 07:30 UTC están dentro, las 06:30 UTC (07:30 Madrid) no.
    expect(enTurno(h, Date.parse("2026-10-25T07:30:00Z"))).toBe(true);
    expect(enTurno(h, Date.parse("2026-10-25T06:30:00Z"))).toBe(false);
    expect(enTurno(h, invierno(LUN2, "12:59"))).toBe(true);
    expect(enTurno(h, invierno(LUN2, "13:00"))).toBe(false); // el fin no está incluido
  });
  test("recordatorios del día del cambio de hora: 5 min antes según la hora de invierno", () => {
    const h: HorarioConductor = { semana: [{ dia_semana: 7, tramos: [t("08:00", "13:00")] }], excepciones: [] };
    const r = recordatoriosTurno(h, Date.parse("2026-10-25T05:00:00Z"));
    expect(r).toHaveLength(1);
    expect(r[0].cuando).toBe(Date.parse("2026-10-25T06:55:00Z"));
  });
});

describe("estado del turno", () => {
  const h = semana();
  test("en turno, pausa, antes, después, libre y sin horario", () => {
    expect(estadoTurno(h, verano(LUN, "10:00"))).toMatchObject({ estado: "en_turno", texto: "en turno hasta 13:00" });
    expect(estadoTurno(h, verano(LUN, "13:00"))).toMatchObject({ estado: "pausa", texto: "en pausa hasta 16:00" });
    expect(estadoTurno(h, verano(LUN, "15:59"))).toMatchObject({ estado: "pausa" });
    expect(estadoTurno(h, verano(LUN, "16:00"))).toMatchObject({ estado: "en_turno", texto: "en turno hasta 20:00" });
    expect(estadoTurno(h, verano(LUN, "06:00"))).toMatchObject({ estado: "antes", texto: "fuera de turno · entra a las 08:00" });
    expect(estadoTurno(h, verano(LUN, "21:00"))).toMatchObject({ estado: "fuera", texto: "fuera de turno" });
    expect(estadoTurno(h, invierno(DOM, "10:00"))).toMatchObject({ estado: "libre", texto: "libre hoy" });
    expect(estadoTurno(null, verano(LUN, "10:00")).estado).toBe("sin_horario");
    expect(estadoTurno(semana(CONTINUO), verano(LUN, "14:59")).texto).toBe("en turno hasta 15:00");
  });
  test("turnoQueContiene: el tramo que abarca todo el rango", () => {
    expect(turnoQueContiene(h, verano(LUN, "09:00"), verano(LUN, "12:00"))?.tramo).toEqual(t("08:00", "13:00"));
    expect(turnoQueContiene(h, verano(LUN, "12:00"), verano(LUN, "14:00"))).toBeNull();
    expect(turnoQueContiene(h, verano(LUN, "17:00"))?.tramo).toEqual(t("16:00", "20:00"));
    expect(turnoQueContiene(h, verano(LUN, "14:00"))).toBeNull();
    expect(turnoQueContiene(null, verano(LUN, "14:00"))).toBeNull();
  });
  test("texto del horario de hoy para el conductor", () => {
    expect(textoHorarioHoy(h, LUN)).toBe("Tu horario de hoy: 08:00–13:00 · 16:00–20:00");
    expect(textoHorarioHoy(h, DOM)).toBe("Hoy libre");
    expect(textoHorarioHoy(null, LUN)).toBeNull();
    const ex: HorarioConductor = { semana: [], excepciones: [{ fecha: LUN, tramos: CONTINUO, nota: "Cubre a Ana" }] };
    expect(textoHorarioHoy(ex, LUN)).toBe("Tu horario de hoy: 07:00–15:00 (Cubre a Ana)");
  });
});

describe("cabeServicio: horas, pausa y vuelta a la base", () => {
  const h = semana();
  const sv = (hora: string, dur: number, origen = salou, destino = reus, dia = LUN) => ({ id: `s${hora}`, inicio: verano(dia, hora), duracionMin: dur, origen, destino });
  test("sin horario siempre cabe", () => {
    expect(cabeServicio(null, sv("03:00", 60))).toMatchObject({ cabe: true, tipo: "sin_horario" });
  });
  test("en la pausa de comida: «Fuera de horario (pausa 13:00–16:00)»", () => {
    expect(cabeServicio(h, sv("14:00", 30))).toMatchObject({ cabe: false, tipo: "pausa", motivo: "Fuera de horario (pausa 13:00–16:00)" });
  });
  test("antes del primer tramo o después del último: «Fuera de horario (turno …)»", () => {
    expect(cabeServicio(h, sv("07:00", 30))).toMatchObject({ cabe: false, tipo: "fuera", motivo: "Fuera de horario (turno 08:00–13:00 · 16:00–20:00)" });
    expect(cabeServicio(h, sv("21:00", 30)).tipo).toBe("fuera");
  });
  test("día libre", () => {
    expect(cabeServicio(h, sv("10:00", 30, salou, reus, DOM))).toMatchObject({ cabe: false, tipo: "libre", motivo: "Fuera de horario (libre ese día)" });
  });
  test("dentro del tramo y con tiempo: cabe, con salida y vuelta a la base", () => {
    const r = cabeServicio(h, sv("09:00", 30), { base: BASE });
    expect(r).toMatchObject({ cabe: true, tipo: "ok", tramo: t("08:00", "13:00") });
    expect(r.salidaBase).toBe(verano(LUN, "09:00")); // la base está en el mismo punto de recogida
    expect(r.vueltaBase).toBe(verano(LUN, "09:30") + tiempoTraslado(reus, BASE)! * MIN);
  });
  test("último servicio del tramo que no le deja volver a la base: «No vuelve a la base antes de las 13:00»", () => {
    const vuelta = tiempoTraslado(barcelona, BASE)!;
    expect(vuelta).toBeGreaterThan(60);
    const r = cabeServicio(h, sv("11:00", 90, salou, barcelona), { base: BASE });
    expect(r).toMatchObject({ cabe: false, tipo: "no_vuelve", motivo: "No vuelve a la base antes de las 13:00" });
  });
  test("si hay otro servicio después en el mismo tramo, no hace falta volver a la base (solo terminar antes del fin)", () => {
    const agenda = [{ id: "otro", inicio: verano(LUN, "12:30"), fin: verano(LUN, "12:50") }];
    expect(cabeServicio(h, sv("10:00", 60, salou, tarragona), { base: barcelona, agenda }).cabe).toBe(true);
  });
  test("termina después del turno (sin base configurada)", () => {
    expect(cabeServicio(h, sv("12:30", 60))).toMatchObject({ cabe: false, tipo: "despues", motivo: "Termina después de su turno (13:00)" });
    expect(cabeServicio(h, sv("12:00", 60)).cabe).toBe(true); // termina justo a las 13:00
  });
  test("primer servicio del tramo: tiene que salir de la base después del inicio del turno", () => {
    const r = cabeServicio(h, sv("16:05", 30, tarragona, salou), { base: barcelona });
    expect(r).toMatchObject({ cabe: false, tipo: "antes" });
    expect(r.motivo).toMatch(/^Empieza antes de su turno \(saldría de la base a las \d\d:\d\d; entra a las 16:00\)$/);
    // Si no es el primero del tramo, viene del servicio anterior: no cuenta la salida de la base.
    const agenda = [{ id: "previo", inicio: verano(LUN, "16:00"), fin: verano(LUN, "16:04") }];
    expect(cabeServicio(h, sv("16:05", 30, tarragona, salou), { base: salou, agenda }).cabe).toBe(true);
  });
  test("la agenda de otros tramos no cuenta para primero/último", () => {
    const agenda = [{ id: "mañana", inicio: verano(LUN, "09:00"), fin: verano(LUN, "10:00") }];
    expect(cabeServicio(h, sv("19:00", 90, salou, barcelona), { base: BASE, agenda }).tipo).toBe("no_vuelve");
  });
  test("el propio servicio en la agenda no cuenta", () => {
    const s = sv("12:00", 50, salou, reus);
    expect(cabeServicio(h, s, { base: BASE, agenda: [{ id: s.id, inicio: s.inicio, fin: s.inicio + 50 * MIN }] }).cabe).toBe(true);
  });
  test("excepción de un día: manda sobre la semana tipo", () => {
    const hx: HorarioConductor = { ...semana(), excepciones: [{ fecha: LUN, tramos: [t("12:00", "22:00")] }] };
    expect(cabeServicio(hx, sv("14:00", 30)).cabe).toBe(true);
    expect(cabeServicio(hx, sv("09:00", 30)).cabe).toBe(false);
  });
  test("con el cambio de hora: servicio el domingo 25 dentro del turno de invierno", () => {
    const hd: HorarioConductor = { semana: [{ dia_semana: 7, tramos: [t("08:00", "13:00")] }], excepciones: [] };
    expect(cabeServicio(hd, { inicio: Date.parse("2026-10-25T07:10:00Z"), duracionMin: 30, origen: salou, destino: reus }, { base: BASE }).cabe).toBe(true);
    // 06:30 UTC = 07:30 en Madrid (invierno): fuera aunque en verano serían las 08:30.
    expect(cabeServicio(hd, { inicio: Date.parse("2026-10-25T06:30:00Z"), duracionMin: 30, origen: salou, destino: reus }).cabe).toBe(false);
    // Termina 12:50 Madrid = 11:50 UTC; con la vuelta a la base (~10 min) llega justo a las 13:00.
    expect(cabeServicio(hd, { inicio: Date.parse("2026-10-25T11:20:00Z"), duracionMin: 30, origen: salou, destino: reus }, { base: BASE }).cabe).toBe(true);
    expect(cabeServicio(hd, { inicio: Date.parse("2026-10-25T11:40:00Z"), duracionMin: 30, origen: salou, destino: reus }, { base: BASE }).tipo).toBe("no_vuelve");
  });
});

describe("vehículos compartidos y semana tipo", () => {
  test("mismo vehículo con tramos solapados → aviso; relevo justo (15:00 / 15:00) → sin aviso", () => {
    const a = { conductorId: "a", semana: [{ dia_semana: 1, tramos: [t("07:00", "15:00")], vehiculo_id: "v1" }] };
    const b = { conductorId: "b", semana: [{ dia_semana: 1, tramos: [t("15:00", "23:00")], vehiculo_id: "v1" }] };
    const c = { conductorId: "c", semana: [{ dia_semana: 1, tramos: [t("14:00", "20:00")], vehiculo_id: "v1" }] };
    const d = { conductorId: "d", semana: [{ dia_semana: 1, tramos: [t("07:00", "15:00")], vehiculo_id: "v2" }] };
    expect(solapeVehiculo([a, b, d])).toEqual([]);
    const s = solapeVehiculo([a, b, c]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ vehiculoId: "v1", diaSemana: 1, a: "a", b: "c" });
    expect(s[1]).toMatchObject({ a: "b", b: "c" });
  });
  test("distinto día o sin vehículo del turno: sin aviso", () => {
    const a = { conductorId: "a", semana: [{ dia_semana: 1, tramos: CONTINUO, vehiculo_id: "v1" }] };
    const b = { conductorId: "b", semana: [{ dia_semana: 2, tramos: CONTINUO, vehiculo_id: "v1" }] };
    const c = { conductorId: "c", semana: [{ dia_semana: 1, tramos: CONTINUO, vehiculo_id: null }] };
    expect(solapeVehiculo([a, b, c])).toEqual([]);
  });
  test("copiar el lunes a todos los días (lunes a domingo)", () => {
    const s = copiarATodos([{ dia_semana: 1, tramos: PARTIDO, vehiculo_id: "v1" }, { dia_semana: 6, tramos: CONTINUO, vehiculo_id: "v2" }]);
    expect(s).toHaveLength(7);
    expect(s.every((d) => d.tramos.length === 2 && d.vehiculo_id === "v1")).toBe(true);
    expect(s.map((d) => d.dia_semana)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(copiarATodos([], 1).every((d) => d.tramos.length === 0)).toBe(true);
  });
  test("segmentos para pintar y huecos fuera de turno", () => {
    expect(segmentosDia([t("06:00", "12:00")])).toEqual([{ desde: 25, hasta: 50, tramo: t("06:00", "12:00") }]);
    expect(fueraDeTurno(PARTIDO)).toEqual([t("00:00", "08:00"), t("13:00", "16:00"), t("20:00", "24:00")]);
    expect(fueraDeTurno([])).toEqual([t("00:00", "24:00")]);
    expect(fueraDeTurno([t("00:00", "24:00")])).toEqual([]);
  });
  test("textos de asignación manual fuera de horario", () => {
    expect(motivoAsignadoFueraHorario("Fuera de horario (pausa 13:00–16:00)")).toBe("fuera_horario: Fuera de horario (pausa 13:00–16:00)");
    expect(preguntaAsignarFueraHorario("No vuelve a la base antes de las 15:00")).toBe("No vuelve a la base antes de las 15:00. ¿Asignar igualmente?");
  });
});

describe("alertas a la central", () => {
  const h = semana();
  test("servicio asignado fuera de horario: una por servicio", () => {
    const a = alertaFueraHorario("Marc", { id: "s1", inicio: verano(LUN, "14:00"), duracionMin: 30, origen: salou, destino: reus }, h);
    expect(a).toEqual({ tipo: "fuera_horario", clave: "s1", servicioId: "s1", texto: "⚠️ Servicio de las 14:00 asignado a Marc fuera de su horario · Fuera de horario (pausa 13:00–16:00)" });
    expect(alertaFueraHorario("Marc", { id: "s2", inicio: verano(LUN, "10:00"), duracionMin: 30, origen: salou, destino: reus }, h)).toBeNull();
    expect(alertaFueraHorario("Marc", { id: "s3", inicio: verano(LUN, "03:00"), duracionMin: 30, origen: salou, destino: reus }, null)).toBeNull();
  });
  test("sin iniciar jornada: desde 15 min después del inicio del tramo, hasta 2 h y antes del fin", () => {
    expect(alertaSinJornada("Marc", h, verano(LUN, "08:14"), { jornadaAbierta: false })).toBeNull();
    const a = alertaSinJornada("Marc", h, verano(LUN, "08:15"), { jornadaAbierta: false });
    expect(a).toEqual({ tipo: "sin_jornada", clave: `${LUN}|08:00`, texto: "⏰ Marc no ha iniciado la jornada: su turno empezó a las 08:00 (hace 15 min)" });
    expect(alertaSinJornada("Marc", h, verano(LUN, "08:30"), { jornadaAbierta: true })).toBeNull();
    expect(alertaSinJornada("Marc", h, verano(LUN, "08:30"), { jornadaAbierta: false, ausente: true })).toBeNull();
    expect(alertaSinJornada("Marc", h, verano(LUN, "10:00"), { jornadaAbierta: false })).toBeNull(); // pasadas 2 h
    // Jornada partida: tras la comida, otra alerta con otra clave.
    expect(alertaSinJornada("Marc", h, verano(LUN, "16:20"), { jornadaAbierta: false })?.clave).toBe(`${LUN}|16:00`);
    expect(alertaSinJornada("Marc", h, invierno(DOM, "10:00"), { jornadaAbierta: false })).toBeNull(); // libre
    expect(alertaSinJornada("Marc", null, verano(LUN, "08:30"), { jornadaAbierta: false })).toBeNull();
    // Tramo corto: no más allá de su fin.
    const corto: HorarioConductor = { semana: [{ dia_semana: 1, tramos: [t("08:00", "08:20")] }], excepciones: [] };
    expect(alertaSinJornada("Marc", corto, verano(LUN, "08:25"), { jornadaAbierta: false })).toBeNull();
  });
  test("en servicio más de 30 min pasado el fin del turno sin poder volver a la base", () => {
    const hc = semana(CONTINUO); // 07:00–15:00
    const enCurso = [{ id: "s1", estado: "recogido", inicio: verano(LUN, "14:30"), duracionMin: 90, destino: barcelona }];
    expect(alertaFinTurno("Marc", hc, verano(LUN, "15:29"), { servicios: enCurso, base: BASE })).toBeNull();
    const a = alertaFinTurno("Marc", hc, verano(LUN, "15:30"), { servicios: enCurso, base: BASE });
    expect(a?.tipo).toBe("fin_turno");
    expect(a?.clave).toBe(`${LUN}|15:00`);
    expect(a?.servicioId).toBe("s1");
    expect(a?.texto).toMatch(/^🕒 Marc sigue en servicio 30 min después de su turno \(fin 15:00\) · vuelta a la base ≈ \d\d:\d\d$/);
    // Sin servicios en curso (ya volvió) → nada; completado → nada.
    expect(alertaFinTurno("Marc", hc, verano(LUN, "15:40"), { servicios: [], base: BASE })).toBeNull();
    expect(alertaFinTurno("Marc", hc, verano(LUN, "15:40"), { servicios: [{ ...enCurso[0], estado: "completado" }], base: BASE })).toBeNull();
    // Pasadas 3 h ya no se avisa; sin horario tampoco.
    expect(alertaFinTurno("Marc", hc, verano(LUN, "18:01"), { servicios: enCurso, base: BASE })).toBeNull();
    expect(alertaFinTurno("Marc", null, verano(LUN, "15:40"), { servicios: enCurso, base: BASE })).toBeNull();
    // Asignado que empieza dentro de 1 h y es de su turno → cuenta; uno de mañana no.
    const asignado = [{ id: "s2", estado: "aceptado", inicio: verano(LUN, "14:50"), duracionMin: 60, destino: reus }];
    expect(alertaFinTurno("Marc", hc, verano(LUN, "15:35"), { servicios: asignado, base: BASE })?.tipo).toBe("fin_turno");
    expect(alertaFinTurno("Marc", hc, verano(LUN, "15:35"), { servicios: [{ ...asignado[0], inicio: verano("2026-10-20", "09:00") }], base: BASE })).toBeNull();
  });
  test("fin de turno: si ya está en el siguiente tramo (partida), no se avisa del anterior", () => {
    const enCurso = [{ id: "s1", estado: "en_camino", inicio: verano(LUN, "12:50"), duracionMin: 60, destino: reus }];
    expect(alertaFinTurno("Marc", h, verano(LUN, "13:40"), { servicios: enCurso, base: BASE })?.clave).toBe(`${LUN}|13:00`);
    expect(alertaFinTurno("Marc", h, verano(LUN, "16:10"), { servicios: enCurso, base: BASE })).toBeNull();
  });
  test("recordatorios: 5 min antes de cada tramo que aún no ha empezado", () => {
    const r = recordatoriosTurno(h, verano(LUN, "07:00"));
    expect(r.map((x) => x.id)).toEqual([`turno-${LUN}-0800`, `turno-${LUN}-1600`]);
    expect(r[0].cuando).toBe(verano(LUN, "07:55"));
    expect(recordatoriosTurno(h, verano(LUN, "09:00")).map((x) => x.tramo.inicio)).toEqual(["16:00"]);
    expect(recordatoriosTurno(h, verano(LUN, "15:56"))).toEqual([]);
    expect(recordatoriosTurno(null, verano(LUN, "07:00"))).toEqual([]);
  });
});

describe("uso en la sugerencia y en la asignación automática", () => {
  const base = (id: string, extra: Partial<Candidato> = {}): Candidato => ({
    conductorId: id, nombre: id, vehiculo: { id: "v" + id, plazas: 8, maletas: 8, estado: "activo" }, posicion: null, agenda: [], ...extra,
  });
  const ahora = new Date(verano(LUN, "06:00"));
  test("sugerencia: en la pausa no es apto, con el motivo; sin horario sí; dentro, «En turno»", () => {
    const s = { id: "s1", inicio: new Date(verano(LUN, "14:00")), duracionMin: 30, pasajeros: 2, maletas: 2, origen: salou, destino: reus };
    const r = sugerirConductores(s, [base("partido", { horario: semana() }), base("libre"), base("tarde", { horario: semana([t("14:00", "22:00")]) })], ahora, { base: BASE });
    const partido = r.find((x) => x.conductorId === "partido")!;
    expect(partido.apto).toBe(false);
    expect(partido.motivos).toContain("Fuera de horario (pausa 13:00–16:00)");
    expect(partido.fueraHorario).toBe("Fuera de horario (pausa 13:00–16:00)");
    expect(r.find((x) => x.conductorId === "libre")!.apto).toBe(true);
    const tarde = r.find((x) => x.conductorId === "tarde")!;
    expect(tarde.apto).toBe(true);
    expect(tarde.motivos).toContain("En turno (14:00–22:00)");
    expect(tarde.fueraHorario).toBeNull();
    expect(r.at(-1)!.conductorId).toBe("partido"); // los no aptos al final
  });
  test("sugerencia: no vuelve a la base antes del fin del tramo", () => {
    const s = { id: "s1", inicio: new Date(verano(LUN, "14:00")), duracionMin: 75, pasajeros: 2, maletas: 2, origen: salou, destino: barcelona };
    const r = sugerirConductores(s, [base("a", { horario: semana(CONTINUO) })], ahora, { base: BASE });
    expect(r[0].apto).toBe(false);
    expect(r[0].fueraHorario).toBe("No vuelve a la base antes de las 15:00");
  });
  const sa = (id: string, hora: string, dur = 30, origen = salou, destino = reus): ServicioAuto => ({ id, inicio: verano(LUN, hora), duracionMin: dur, pasajeros: 2, maletas: 2, origen, destino });
  const ca = (id: string, extra: Partial<ConductorAuto> = {}): ConductorAuto => ({ id, nombre: id, vehiculo: { id: "v" + id, plazas: 8, maletas: 8, estado: "activo" }, compromisos: [], ...extra });
  test("comprobar: fuera de horario devuelve el motivo", () => {
    const ch = comprobar(ca("a", { horario: semana() }), [], sa("s", "14:00"), 15, verano(LUN, "06:00"), BASE);
    expect(ch).toMatchObject({ ok: false, motivo: "Fuera de horario (pausa 13:00–16:00)" });
    expect(comprobar(ca("a", { horario: semana() }), [], sa("s", "10:00"), 15, verano(LUN, "06:00"), BASE).ok).toBe(true);
  });
  test("propuesta automática: cada servicio al conductor que está en turno; nada en la pausa ni fuera", () => {
    const mananas = ca("a-mananas", { horario: semana([t("06:00", "14:00")]) });
    const tardes = ca("b-tardes", { horario: semana([t("14:00", "22:00")]) });
    const servicios = [sa("s1", "08:00"), sa("s2", "10:00"), sa("s3", "15:00"), sa("s4", "18:00"), sa("s5", "23:00")];
    const e = { servicios, conductores: [mananas, tardes], estrategia: "equitativo" as const, margenMinimoMin: 15, ahora: verano(LUN, "06:00"), base: BASE };
    const p = proponerAsignacion(e);
    const de = (id: string) => p.lineas.find((l) => l.servicioId === id)!;
    expect(de("s1").conductorId).toBe("a-mananas");
    expect(de("s2").conductorId).toBe("a-mananas");
    expect(de("s3").conductorId).toBe("b-tardes");
    expect(de("s4").conductorId).toBe("b-tardes");
    expect(de("s5").conductorId).toBeNull();
    expect(de("s5").motivoSiNo).toMatch(/Fuera de horario \(turno/);
    expect(auditarPropuesta(e, p)).toEqual([]);
  });
  test("auditarPropuesta detecta una asignación forzada fuera de horario", () => {
    const a = ca("a", { horario: semana() });
    const e = { servicios: [sa("s1", "14:00")], conductores: [a], estrategia: "equitativo" as const, margenMinimoMin: 15, ahora: verano(LUN, "06:00"), base: BASE };
    const p = { lineas: [{ servicioId: "s1", conductorId: "a", llegadaEstimada: null, margenMin: null, margenAntesMin: null, margenDespuesMin: null, kmVacio: null, ok: false, grave: false, motivoSiNo: null, subcontratar: false }], metricas: [] };
    expect(auditarPropuesta(e, p)).toEqual(["a: Fuera de horario (pausa 13:00–16:00) (s1)"]);
  });
});

describe("actividad de la central", () => {
  test("alertas de horario: tarjeta de aviso con posición; ocultas si el servicio es de prueba", async () => {
    const { construirActividad } = await import("@/lib/dominio/actividad");
    const r = construirActividad({
      servicios: [], conductores: [{ id: "c1", nombre: "Marc", telefono: "600" }], posiciones: [{ conductor_id: "c1", lat: 41.08, lng: 1.14 }],
      alertasHorario: [
        { id: "a1", tipo: "sin_jornada", conductor_id: "c1", servicio_id: null, texto: "⏰ Marc no ha iniciado la jornada", creado_en: "2026-10-19T06:20:00Z" },
        { id: "a2", tipo: "fuera_horario", conductor_id: "c1", servicio_id: "s-prueba", texto: "⚠️ …", creado_en: "2026-10-19T06:21:00Z" },
      ],
      ocultos: ["s-prueba"],
    });
    expect(r.movimientos).toHaveLength(1);
    expect(r.avisos[0]).toMatchObject({ id: "ah-a1", tipo: "horario_sin_jornada", gravedad: "aviso", alerta: true, telefono: "600", lat: 41.08 });
  });
  test("asignado igualmente fuera de horario: queda en el texto del movimiento", async () => {
    const { construirActividad } = await import("@/lib/dominio/actividad");
    const s = { id: "s1", cliente_nombre: "Ana", origen_texto: "Salou", destino_texto: "Aeropuerto de Reus", fecha_hora_recogida: "2026-10-19T12:00:00Z", conductor_id: "c1" };
    const r = construirActividad({ servicios: [s], conductores: [{ id: "c1", nombre: "Marc" }],
      eventos: [{ id: 1, servicio_id: "s1", tipo: "asignado", motivo: motivoAsignadoFueraHorario("Fuera de horario (pausa 13:00–16:00)"), creado_en: "2026-10-19T08:00:00Z" }] });
    expect(r.movimientos[0].texto).toMatch(/fuera de su horario \(Fuera de horario \(pausa 13:00–16:00\)\)$/);
    expect(r.movimientos[0].gravedad).toBe("aviso");
  });
});

describe("turno de noche (22:00–06:00, termina al día siguiente)", () => {
  const NOCHE = [t("22:00", "06:00")];
  /** L–V de noche con la furgo v1; sábado y domingo libres. */
  const noche: HorarioConductor = {
    semana: [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos: NOCHE, vehiculo_id: "v1" as string | null }))
      .concat([6, 7].map((d) => ({ dia_semana: d, tramos: [], vehiculo_id: null }))),
    excepciones: [],
  };
  const MAR = "2026-10-20";

  test("validación: de noche vale; no puede pisar el primer tramo ni solaparse; tras él no se añade otro", () => {
    expect(esNocturno(t("22:00", "06:00"))).toBe(true);
    expect(esNocturno(t("22:00", "00:00"))).toBe(true);
    expect(esNocturno(t("16:00", "24:00"))).toBe(false);
    expect(validarTramos([t("22:00", "06:00"), t("06:00", "10:00")]).ok).toBe(true); // la cola acaba cuando empieza el primero
    expect(validarTramos([t("22:00", "09:00"), t("08:00", "12:00")])).toMatchObject({ ok: false, error: expect.stringMatching(/turno de noche/) });
    expect(validarTramos([t("20:00", "02:00"), t("23:00", "23:30")])).toMatchObject({ ok: false, error: expect.stringMatching(/solapan/) });
    expect(validarTramos([t("20:00", "02:00"), t("21:00", "01:00")]).ok).toBe(false);
  });

  test("intervalo: termina a las 06:00 del día siguiente (y con el cambio de hora dura 9 h)", () => {
    const i = intervalo(LUN, NOCHE[0]);
    expect(i.inicio).toBe(verano(LUN, "22:00"));
    expect(i.fin).toBe(verano(MAR, "06:00"));
    const cambio = intervalo(SAB, NOCHE[0]); // 24→25/10: a las 03:00 vuelven a ser las 02:00
    expect(cambio.fin).toBe(invierno(DOM, "06:00"));
    expect((cambio.fin - cambio.inicio) / 3_600_000).toBe(9);
  });

  test("la madrugada cuenta como turno: enTurno, estado y turnoQueContiene", () => {
    expect(enTurno(noche, verano(MAR, "03:00"))).toBe(true); // cola del lunes
    expect(enTurno(noche, verano(MAR, "23:30"))).toBe(true);
    expect(enTurno(noche, verano(MAR, "12:00"))).toBe(false);
    expect(enTurno(noche, invierno("2026-10-31", "03:00"))).toBe(true); // sábado de madrugada: cola del viernes
    expect(enTurno(noche, invierno("2026-11-01", "03:00"))).toBe(false); // domingo de madrugada: el sábado es libre
    expect(estadoTurno(noche, verano(MAR, "03:00"))).toMatchObject({ estado: "en_turno", hasta: "06:00" });
    expect(estadoTurno(noche, verano(MAR, "12:00"))).toMatchObject({ estado: "antes", desde: "22:00" }); // no es «pausa»
    expect(estadoTurno(noche, verano(SAB, "03:00"))).toMatchObject({ estado: "en_turno" }); // sábado libre, pero la noche del viernes sigue
    expect(estadoTurno(noche, verano(SAB, "12:00"))).toMatchObject({ estado: "fuera" });
    expect(estadoTurno(noche, verano(DOM, "12:00"))).toMatchObject({ estado: "libre" });
    expect(turnoQueContiene(noche, verano(MAR, "04:00"), verano(MAR, "05:00"))?.fecha).toBe(LUN);
  });

  test("cabeServicio: un servicio a las 02:00 cabe; a las 05:30 de 1 h no (acaba después de las 06:00); por la tarde no", () => {
    const s = (dia: string, h: string, dur = 45) => ({ inicio: verano(dia, h), duracionMin: dur, origen: null, destino: null });
    expect(cabeServicio(noche, s(MAR, "02:00"))).toMatchObject({ cabe: true, tramo: NOCHE[0] });
    expect(cabeServicio(noche, s(MAR, "23:00"))).toMatchObject({ cabe: true });
    expect(cabeServicio(noche, s(MAR, "05:30", 60))).toMatchObject({ cabe: false, tipo: "despues" });
    expect(cabeServicio(noche, s(MAR, "15:00"))).toMatchObject({ cabe: false, tipo: "fuera", motivo: "Fuera de horario (turno 22:00–06:00)" });
    expect(cabeServicio(noche, s(SAB, "02:00"))).toMatchObject({ cabe: true }); // cola del viernes
    expect(cabeServicio(noche, s(DOM, "02:00", 30))).toMatchObject({ cabe: false, tipo: "libre" });
  });

  test("alertas: sin jornada a las 22:20; fin de turno pasada la hora (06:40) con un servicio en curso", () => {
    const sj = alertaSinJornada("Laia", noche, verano(LUN, "22:20"), { jornadaAbierta: false });
    expect(sj).toMatchObject({ tipo: "sin_jornada", clave: `${LUN}|22:00` });
    expect(alertaSinJornada("Laia", noche, verano(MAR, "03:00"), { jornadaAbierta: false })).toBeNull(); // pasada la ventana de 2 h
    const ft = alertaFinTurno("Laia", noche, verano(MAR, "06:40"), {
      servicios: [{ id: "s1", estado: "recogido", inicio: verano(MAR, "06:00"), duracionMin: 60, destino: null }],
    });
    expect(ft).toMatchObject({ tipo: "fin_turno", clave: `${LUN}|06:00` });
  });

  test("un turno que acaba a las 23:30 se sigue vigilando pasada la medianoche", () => {
    const tarde: HorarioConductor = { semana: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dia_semana: d, tramos: [t("15:00", "23:30")] })), excepciones: [] };
    const ft = alertaFinTurno("Marc", tarde, verano(MAR, "00:10"), {
      servicios: [{ id: "s1", estado: "en_camino", inicio: verano(LUN, "23:20"), duracionMin: 60, destino: null }],
    });
    expect(ft).toMatchObject({ tipo: "fin_turno", clave: `${LUN}|23:30` });
  });

  test("recordatorio solo para el turno que empieza hoy (no para la cola de anoche)", () => {
    const r = recordatoriosTurno(noche, verano(MAR, "03:00"));
    expect(r.map((x) => x.tramo.inicio)).toEqual(["22:00"]);
    expect(r[0].cuando).toBe(verano(MAR, "21:55"));
  });

  test("pintar el día: cola 00:00–06:00 de la víspera + 22:00–24:00", () => {
    expect(tramosPintadosDia(noche, MAR)).toEqual([t("00:00", "06:00"), t("22:00", "24:00")]);
    expect(tramosPintadosDia(noche, LUN)).toEqual([t("22:00", "24:00")]); // el domingo es libre
    expect(tramosPintadosDia(noche, SAB)).toEqual([t("00:00", "06:00")]);
    expect(segmentosDia(NOCHE)).toEqual([{ desde: (1320 / 1440) * 100, hasta: 100, tramo: NOCHE[0] }]);
    expect(fueraDeTurno(NOCHE)).toEqual([t("00:00", "22:00")]);
    expect(intervalosDelDia(noche, MAR)?.map((i) => i.fecha)).toEqual([LUN, MAR]);
  });

  test("vehículo compartido: la cola de noche choca con quien coge la furgo a las 05:00, pero no con el relevo de las 06:00", () => {
    const manana = (inicio: string) => ({ conductorId: "b", semana: [{ dia_semana: 2, tramos: [t(inicio, "14:00")], vehiculo_id: "v1" }] });
    const a = { conductorId: "a", semana: [{ dia_semana: 1, tramos: NOCHE, vehiculo_id: "v1" }] };
    expect(solapeVehiculo([a, manana("06:00")])).toEqual([]);
    expect(solapeVehiculo([a, manana("05:00")])).toMatchObject([{ diaSemana: 2, a: "a", b: "b", tramoA: NOCHE[0] }]);
  });
});
