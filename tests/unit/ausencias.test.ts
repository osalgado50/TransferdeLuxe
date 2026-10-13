import { describe, expect, test } from "vitest";
import {
  ausenciaEn, bloqueoConductor, calendarioMes, cubre, diasDelMes, franjaDeHora, motivoAsignadoAusente, motivoNoDisponible,
  preguntaAsignarAusente, proximasAusencias, serviciosAfectados, sumarMeses, textoAusencia, validarAusencia, type Ausencia,
} from "@/lib/dominio/ausencias";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";
import { comprobar, proponerAsignacion, type ConductorAuto, type ServicioAuto } from "@/lib/dominio/autoasignacion";
import { transicion } from "@/lib/dominio/estados";

const MARC = "11111111-1111-1111-1111-111111111111", ANA = "22222222-2222-2222-2222-222222222222";
const vac = (o: Partial<Ausencia> = {}): Ausencia => ({ conductor_id: MARC, desde: "2026-10-20", hasta: "2026-10-24", franja: "dia", tipo: "vacaciones", ...o });
const madrid = (dia: string, hhmm: string) => `${dia}T${hhmm}:00+02:00`;

describe("franjas y cobertura", () => {
  test("mañana antes de las 14:00 (hora de Madrid), tarde desde las 14:00", () => {
    expect(franjaDeHora(madrid("2026-10-20", "13:59"))).toBe("manana");
    expect(franjaDeHora(madrid("2026-10-20", "14:00"))).toBe("tarde");
    expect(franjaDeHora("2026-12-20T12:30:00Z")).toBe("manana"); // invierno: 12:30 UTC = 13:30 en Madrid
    expect(franjaDeHora("2026-07-20T12:30:00Z")).toBe("tarde"); // verano: 12:30 UTC = 14:30 en Madrid
  });
  test("día completo cubre las dos franjas; media jornada solo la suya; extremos incluidos", () => {
    expect(cubre(vac(), "2026-10-20")).toBe(true);
    expect(cubre(vac(), "2026-10-24", "tarde")).toBe(true);
    expect(cubre(vac(), "2026-10-25")).toBe(false);
    const tarde = vac({ desde: "2026-10-21", hasta: "2026-10-21", franja: "tarde" });
    expect(cubre(tarde, "2026-10-21", "manana")).toBe(false);
    expect(cubre(tarde, "2026-10-21", "tarde")).toBe(true);
  });
  test("ausenciaEn: según el día y la franja del servicio", () => {
    const l = [vac({ desde: "2026-10-21", hasta: "2026-10-21", franja: "tarde", tipo: "libre" })];
    expect(ausenciaEn(l, MARC, madrid("2026-10-21", "10:00"))).toBeNull();
    expect(ausenciaEn(l, MARC, madrid("2026-10-21", "16:00"))?.tipo).toBe("libre");
    expect(ausenciaEn(l, ANA, madrid("2026-10-21", "16:00"))).toBeNull();
  });
  test("textos", () => {
    expect(motivoNoDisponible(vac())).toBe("No disponible · vacaciones");
    expect(motivoNoDisponible(vac({ franja: "tarde", tipo: "libre" }))).toBe("No disponible · día libre (tarde)");
    expect(preguntaAsignarAusente(vac())).toBe("Está de vacaciones ese día. ¿Asignar igualmente?");
    expect(motivoAsignadoAusente(vac())).toBe("ausente: vacaciones");
    expect(textoAusencia(vac())).toBe("Vacaciones · 20 oct – 24 oct");
    expect(textoAusencia(vac({ desde: "2026-10-21", hasta: "2026-10-21", franja: "manana", tipo: "fiesta" }))).toBe("Fiesta · 21 oct (mañana)");
  });
});

describe("validación del alta", () => {
  test("válida; «hasta» vacío = un día", () => {
    const r = validarAusencia({ conductor_id: MARC, desde: "2026-10-20", hasta: "", tipo: "fiesta", nota: "  Fiesta local " });
    expect(r).toEqual({ ok: true, datos: { conductor_id: MARC, desde: "2026-10-20", hasta: "2026-10-20", franja: "dia", tipo: "fiesta", nota: "Fiesta local" } });
  });
  test("errores", () => {
    expect(validarAusencia({ conductor_id: "x", desde: "2026-10-20", tipo: "fiesta" }).ok).toBe(false);
    expect(validarAusencia({ conductor_id: MARC, desde: "2026-10-20", tipo: "playa" }).ok).toBe(false);
    expect(validarAusencia({ conductor_id: MARC, desde: "2026-10-22", hasta: "2026-10-20", tipo: "baja" })).toEqual({ ok: false, error: "La fecha final es anterior a la inicial." });
    expect(validarAusencia({ conductor_id: MARC, desde: "2026-10-20", hasta: "2026-10-21", franja: "tarde", tipo: "libre" }).ok).toBe(false);
    expect(validarAusencia({ conductor_id: MARC, desde: "2026-01-01", hasta: "2027-06-01", tipo: "baja" }).ok).toBe(false);
  });
});

describe("servicios afectados, calendario y próximas", () => {
  test("solo asignados/aceptados del conductor dentro de la ausencia (y franja)", () => {
    const s = [
      { id: "a", conductor_id: MARC, estado: "aceptado", fecha_hora_recogida: madrid("2026-10-21", "16:00") },
      { id: "b", conductor_id: MARC, estado: "asignado", fecha_hora_recogida: madrid("2026-10-21", "09:00") },
      { id: "c", conductor_id: MARC, estado: "completado", fecha_hora_recogida: madrid("2026-10-21", "17:00") },
      { id: "d", conductor_id: ANA, estado: "aceptado", fecha_hora_recogida: madrid("2026-10-21", "18:00") },
      { id: "e", conductor_id: MARC, estado: "aceptado", fecha_hora_recogida: madrid("2026-10-25", "10:00") },
    ];
    expect(serviciosAfectados(vac(), s).map((x) => x.id)).toEqual(["b", "a"]);
    expect(serviciosAfectados(vac({ desde: "2026-10-21", hasta: "2026-10-21", franja: "tarde" }), s).map((x) => x.id)).toEqual(["a"]);
  });
  test("calendario: mes completo, día entero manda, mañana+tarde = día", () => {
    expect(diasDelMes("2026-02")).toHaveLength(28);
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    const cal = calendarioMes("2026-10", [{ id: MARC }, { id: ANA }], [
      vac(), vac({ conductor_id: ANA, desde: "2026-10-05", hasta: "2026-10-05", franja: "manana", tipo: "libre" }),
      vac({ conductor_id: ANA, desde: "2026-10-05", hasta: "2026-10-05", franja: "tarde", tipo: "fiesta" }),
    ]);
    expect(cal[MARC]).toHaveLength(31);
    expect(cal[MARC][19]).toMatchObject({ dia: "2026-10-20", franja: "dia" });
    expect(cal[MARC][18].ausencia).toBeNull();
    expect(cal[ANA][4].franja).toBe("dia");
  });
  test("próximas: las no terminadas, por fecha", () => {
    const l = [vac({ desde: "2026-11-01", hasta: "2026-11-02" }), vac({ desde: "2026-10-01", hasta: "2026-10-02" }), vac()];
    expect(proximasAusencias(l, "2026-10-13").map((a) => a.desde)).toEqual(["2026-10-20", "2026-11-01"]);
  });
});

describe("bloqueo en la sugerencia y en la asignación automática", () => {
  const ahora = new Date(madrid("2026-10-20", "08:00"));
  test("bloqueoConductor: ausencia o jornada cerrada hoy (solo para hoy)", () => {
    const c = { id: MARC, ausencias: [vac({ desde: "2026-10-22", hasta: "2026-10-22" })], jornadaCerradaDia: "2026-10-20" };
    expect(bloqueoConductor(c, madrid("2026-10-20", "18:00"))?.motivo).toBe("Jornada cerrada hoy");
    expect(bloqueoConductor(c, madrid("2026-10-21", "18:00"))).toBeNull();
    expect(bloqueoConductor(c, madrid("2026-10-22", "09:00"))?.motivo).toBe("No disponible · vacaciones");
  });
  test("sugerencia: el ausente no es apto y lleva la ausencia (para pedir confirmación)", () => {
    const base = (id: string, extra: Partial<Candidato> = {}): Candidato => ({ conductorId: id, nombre: id, vehiculo: { id: "v" + id, plazas: 8, maletas: 8, estado: "activo" }, posicion: null, agenda: [], ...extra });
    const r = sugerirConductores({ id: "s1", inicio: new Date(madrid("2026-10-21", "16:00")), duracionMin: 40, pasajeros: 2, maletas: 2, origen: null },
      [base(MARC, { ausencias: [vac()] }), base(ANA)], ahora);
    expect(r[0].conductorId).toBe(ANA);
    expect(r[1]).toMatchObject({ conductorId: MARC, apto: false, ausencia: { tipo: "vacaciones", franja: "dia" } });
    expect(r[1].motivos).toContain("No disponible · vacaciones");
    const hoy = sugerirConductores({ id: "s2", inicio: new Date(madrid("2026-10-20", "18:00")), duracionMin: 40, pasajeros: 2, maletas: 2, origen: null },
      [base(MARC, { jornadaCerradaDia: "2026-10-20" })], ahora);
    expect(hoy[0]).toMatchObject({ apto: false, ausencia: null });
    expect(hoy[0].motivos).toContain("Jornada cerrada hoy");
  });
  test("asignación automática: no propone al ausente ni a quien cerró hoy; sí otro día", () => {
    const veh = { id: "v", plazas: 7, maletas: 7, estado: "activo" as const };
    const marc: ConductorAuto = { id: MARC, nombre: "MARC", vehiculo: veh, compromisos: [], ausencias: [vac({ desde: "2026-10-21", hasta: "2026-10-21", franja: "tarde" })], jornadaCerradaDia: "2026-10-20" };
    const ana: ConductorAuto = { id: ANA, nombre: "ANA", vehiculo: veh, compromisos: [] };
    const sv = (id: string, iso: string): ServicioAuto => ({ id, inicio: Date.parse(iso), duracionMin: 30, pasajeros: 2, maletas: 2, origen: null, destino: null });
    const hoyTarde = sv("hoy", madrid("2026-10-20", "18:00")), mananaTarde = sv("tarde21", madrid("2026-10-21", "16:00")), mananaPronto = sv("manana21", madrid("2026-10-21", "09:00"));
    expect(comprobar(marc, [], hoyTarde, 15, ahora.getTime())).toMatchObject({ ok: false, motivo: "Jornada cerrada hoy" });
    expect(comprobar(marc, [], mananaTarde, 15, ahora.getTime())).toMatchObject({ ok: false, motivo: "No disponible · vacaciones (tarde)" });
    expect(comprobar(marc, [], mananaPronto, 15, ahora.getTime()).ok).toBe(true);
    const p = proponerAsignacion({ servicios: [hoyTarde, mananaTarde, mananaPronto], conductores: [marc], estrategia: "equitativo", margenMinimoMin: 15, ahora: ahora.getTime() });
    const q = Object.fromEntries(p.lineas.map((l) => [l.servicioId, l]));
    expect(q.hoy.conductorId).toBeNull();
    expect(q.hoy.motivoSiNo).toContain("Jornada cerrada hoy");
    expect(q.tarde21.conductorId).toBeNull();
    expect(q.manana21.conductorId).toBe(MARC);
    const p2 = proponerAsignacion({ servicios: [hoyTarde], conductores: [marc, ana], estrategia: "equitativo", margenMinimoMin: 15, ahora: ahora.getTime() });
    expect(p2.lineas[0].conductorId).toBe(ANA);
  });
});

describe("desasignar (central)", () => {
  test("operador: de asignado/aceptado a pendiente con evento «desasignado»; el conductor no puede", () => {
    expect(transicion("aceptado", "desasignar", { rol: "operador", esAsignado: false, central: true })).toEqual({ ok: true, nuevo: "pendiente", evento: "desasignado" });
    expect(transicion("asignado", "desasignar", { rol: "operador", esAsignado: false, central: true }).ok).toBe(true);
    expect(transicion("en_camino", "desasignar", { rol: "operador", esAsignado: false, central: true }).ok).toBe(false);
    expect(transicion("aceptado", "desasignar", { rol: "conductor", esAsignado: true }).ok).toBe(false);
  });
});
