import { describe, expect, test } from "vitest";
import { alertaFinTurno, alertaHorarioVigente, alertaSinJornada, type HorarioConductor, type Tramo } from "@/lib/dominio/horarios";
import { construirActividad, textoAlDia } from "@/lib/dominio/actividad";
import { alertaJornadaLarga, avisoJornadaLarga, detallePorDia, salidaConDia } from "@/lib/dominio/jornadaLarga";
import { enLotes, mensajesCentral } from "@/lib/dominio/lotePush";

const MIN = 60_000;
const LUN = "2026-10-19"; // verano (UTC+2)
const verano = (dia: string, h: string) => Date.parse(`${dia}T${h}:00+02:00`);
const t = (inicio: string, fin: string): Tramo => ({ inicio, fin });
const horario = (tramos: Tramo[]): HorarioConductor => ({ semana: [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, tramos })), excepciones: [] });
const PARTIDO = horario([t("08:00", "13:00"), t("16:00", "20:00")]);
const CONTINUO = horario([t("07:00", "15:00")]);
const reus = { lat: 41.1474, lng: 1.1672 };
const salou = { lat: 41.0763, lng: 1.1416 };
const ctx = { jornadaAbierta: false, conJornada: true, servicios: [] as { id: string; estado: string; inicio: number; duracionMin: number; destino: null }[] };

describe("alertas de horario que se resuelven solas (n.º 5)", () => {
  test("sin iniciar jornada: vigente hasta que inicia la jornada, se ausenta o acaba el tramo", () => {
    const a = alertaSinJornada("Marc", PARTIDO, verano(LUN, "08:15"), { jornadaAbierta: false })!;
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "09:30"), ctx)).toBe(true);
    // Más allá de las 2 h en que se crean alertas, sigue vigente: no ha empezado.
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "12:00"), ctx)).toBe(true);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "09:30"), { ...ctx, jornadaAbierta: true })).toBe(false);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "09:30"), { ...ctx, ausente: true })).toBe(false);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "13:00"), ctx)).toBe(false); // acabó el tramo
    expect(alertaHorarioVigente(a, null, verano(LUN, "09:30"), ctx)).toBe(false); // ya no tiene horario
    expect(alertaHorarioVigente(a, CONTINUO, verano(LUN, "09:30"), ctx)).toBe(false); // ese tramo ya no existe
  });
  test("fin de turno: vigente mientras siga con el servicio; resuelta al quedar libre, cerrar jornada o entrar en otro tramo", () => {
    const enCurso = [{ id: "s1", estado: "recogido", inicio: verano(LUN, "12:30"), duracionMin: 90, destino: reus }];
    const a = alertaFinTurno("Marc", PARTIDO, verano(LUN, "13:30"), { servicios: enCurso, base: salou })!;
    expect(a.tipo).toBe("fin_turno");
    const c = { ...ctx, jornadaAbierta: true, servicios: enCurso };
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "14:00"), c)).toBe(true);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "14:00"), { ...c, servicios: [] })).toBe(false); // quedó libre
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "14:00"), { ...c, servicios: [{ ...enCurso[0], estado: "completado" }] })).toBe(false);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "14:00"), { ...c, jornadaAbierta: false })).toBe(false); // cerró la jornada
    // Sin el módulo de jornada, «sin jornada abierta» no significa que la haya cerrado.
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "14:00"), { ...c, jornadaAbierta: false, conJornada: false })).toBe(true);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "16:05"), c)).toBe(false); // ya en el tramo de la tarde
  });
  test("fuera de horario: mientras el servicio siga activo y asignado a ese conductor; jornada larga: mientras siga abierta", () => {
    const a = { tipo: "fuera_horario", clave: "s9", servicioId: "s9" };
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "09:00"), { ...ctx, servicios: [{ id: "s9", estado: "aceptado", inicio: 0, duracionMin: 30, destino: null }] })).toBe(true);
    expect(alertaHorarioVigente(a, PARTIDO, verano(LUN, "09:00"), ctx)).toBe(false); // reasignado, cancelado o completado
    const j = { tipo: "jornada_larga", clave: "j1" };
    expect(alertaHorarioVigente(j, null, 0, { ...ctx, jornadasAbiertas: new Set(["j1"]) })).toBe(true);
    expect(alertaHorarioVigente(j, null, 0, { ...ctx, jornadasAbiertas: new Set() })).toBe(false);
  });
  test("textoAlDia deja de contar al resolverse", () => {
    const en = "2026-10-19T06:15:00Z";
    const tx = "⏰ Marc no ha iniciado la jornada: su turno empezó a las 08:00 (hace 15 min)";
    const resuelta = new Date(Date.parse(en) + 20 * MIN).toISOString();
    expect(textoAlDia(tx, en, Date.parse(en) + 7 * 60 * MIN, resuelta)).toMatch(/\(hace 35 min\)$/);
    expect(textoAlDia(tx, en, Date.parse(en) + 10 * MIN, resuelta)).toMatch(/\(hace 25 min\)$/); // aún no
    expect(textoAlDia(tx, en, Date.parse(en) + 10 * MIN, "x")).toMatch(/\(hace 25 min\)$/); // fecha rara: se ignora
  });
  test("actividad: la resuelta no es tarjeta, sale en el feed con el tiempo final y la hora de resolución", () => {
    const base = { tipo: "fin_turno", conductor_id: "c1", servicio_id: null, creado_en: "2026-10-19T11:30:00Z" };
    const r = construirActividad({
      servicios: [], conductores: [{ id: "c1", nombre: "Marc" }],
      alertasHorario: [
        { ...base, id: "a1", texto: "🕒 Marc sigue en servicio 30 min después de su turno (fin 13:00) · vuelta a la base ≈ 14:10", resuelta_en: "2026-10-19T12:10:00Z" },
        { ...base, id: "a2", tipo: "jornada_larga", texto: "⏳ Marc lleva 14 h con la jornada abierta", creado_en: "2026-10-19T11:40:00Z" },
      ],
    });
    expect(r.avisos.map((a) => a.id)).toEqual(["ah-a2"]);
    expect(r.avisos[0].icono).toBe("⏳");
    const a1 = r.movimientos.find((m) => m.id === "ah-a1")!;
    expect(a1).toMatchObject({ alerta: false, gravedad: "info", resueltaEn: "2026-10-19T12:10:00Z" });
    expect(a1.texto).toBe("🕒 Marc sigue en servicio 1 h 10 min después de su turno (fin 13:00) · vuelta a la base ≈ 14:10 · ✓ resuelto a las 14:10");
  });
});

describe("jornadas demasiado largas (n.º 17)", () => {
  const ahora = Date.parse("2026-10-16T08:00:00Z"); // 10:00 en Madrid
  test("aviso en la lista: abierta > 14 h o cerrada tras > 14 h", () => {
    expect(avisoJornadaLarga({ inicio: "2026-10-15T20:00:00Z", fin: null }, ahora)).toBeNull(); // 12 h
    expect(avisoJornadaLarga({ inicio: "2026-10-13T22:00:00Z", fin: null }, ahora)).toBe("Abierta hace 58 h: ¿se olvidó de cerrarla?");
    expect(avisoJornadaLarga({ inicio: "2026-10-13T17:39:00Z", fin: "2026-10-15T08:35:00Z" }, ahora)).toBe("Duró 38 h: revisa la salida");
    expect(avisoJornadaLarga({ inicio: "2026-10-15T06:00:00Z", fin: "2026-10-15T15:00:00Z" }, ahora)).toBeNull();
  });
  test("salida con el día si no es el de la entrada", () => {
    expect(salidaConDia("2026-10-15T06:00:00Z", "2026-10-15T15:00:00Z")).toBe("17:00");
    expect(salidaConDia("2026-10-14T17:39:00Z", "2026-10-15T08:35:00Z")).toBe("10:35 (+1 día)");
    expect(salidaConDia("2026-10-13T17:39:00Z", "2026-10-15T08:35:00Z")).toBe("10:35 (15/10)");
  });
  test("detalle por día: nº de jornadas y el aviso de la abierta primero", () => {
    const d = detallePorDia([
      { conductor_id: "c1", inicio: "2026-10-13T06:00:00Z", fin: "2026-10-13T10:00:00Z" },
      { conductor_id: "c1", inicio: "2026-10-13T12:00:00Z", fin: null },
      { conductor_id: "c2", inicio: "2026-10-16T06:00:00Z", fin: null },
    ], ahora);
    expect(d.get("c1|2026-10-13")).toEqual({ jornadas: 2, aviso: "Abierta hace 68 h: ¿se olvidó de cerrarla?" });
    expect(d.get("c2|2026-10-16")).toEqual({ jornadas: 1, aviso: null });
  });
  test("alerta a la central: una por jornada abierta > 14 h", () => {
    expect(alertaJornadaLarga("Marc", { id: "j1", inicio: "2026-10-15T20:00:00Z", fin: null }, ahora)).toBeNull();
    expect(alertaJornadaLarga("Marc", { id: "j1", inicio: "2026-10-13T22:00:00Z", fin: "2026-10-14T06:00:00Z" }, ahora)).toBeNull();
    expect(alertaJornadaLarga("Marc", { id: "j1", inicio: "2026-10-15T17:39:00Z", fin: null }, ahora)).toEqual({
      tipo: "jornada_larga", clave: "j1", texto: "⏳ Marc lleva 14 h con la jornada abierta (desde las 19:39 del 15/10): ¿se olvidó de cerrarla?" });
  });
});

describe("avisos a la central en lote (n.º 20)", () => {
  test("un mensaje por aviso y dispositivo, sin tokens repetidos; lotes de 100", () => {
    const m = mensajesCentral(["A", "B", "A", ""], [{ titulo: "T1", cuerpo: "C1", data: { tipo: "horario" } }, { titulo: "T2", cuerpo: "C2", data: { tipo: "accidente" } }]);
    expect(m.map((x) => `${x.to}:${x.title}`)).toEqual(["A:T1", "B:T1", "A:T2", "B:T2"]);
    expect(m[0]).toMatchObject({ priority: "high", sound: "aviso.wav", channelId: "aviso" });
    expect(m[2]).toMatchObject({ sound: "alarma.wav" });
    expect(mensajesCentral([], [{ titulo: "x", cuerpo: "y", data: {} }])).toEqual([]);
    expect(enLotes(Array.from({ length: 250 }, (_, i) => i)).map((l) => l.length)).toEqual([100, 100, 50]);
  });
});
