import { describe, expect, test } from "vitest";
import {
  accionFinJornada, agruparFinJornada, cerradaHoy, esDevolucionFinJornada, franjaDevueltos, pendientesHoy, textoDevueltosFinJornada,
  textoJornadaConPendientes, textoPendientes, MOTIVO_FIN_JORNADA,
} from "@/lib/dominio/finJornada";
import { evaluarAnomalia, leerMotivoAnomalia, motivoAnomalia, posicionEnEvento, textoAnomalia } from "@/lib/dominio/anomalias";

const madrid = (dia: string, hhmm: string) => `${dia}T${hhmm}:00+02:00`;
const ahora = new Date(madrid("2026-10-20", "12:00"));

describe("fin de jornada con servicios pendientes hoy", () => {
  const sv = (id: string, estado: string, iso: string) => ({ id, estado, fecha_hora_recogida: iso });
  test("solo HOY, posteriores a ahora y en asignado/aceptado/en camino; ordenados", () => {
    const l = [
      sv("tarde2", "aceptado", madrid("2026-10-20", "18:30")), sv("tarde1", "asignado", madrid("2026-10-20", "16:00")),
      sv("pasado", "aceptado", madrid("2026-10-20", "11:00")), sv("manana", "aceptado", madrid("2026-10-21", "09:00")),
      sv("hecho", "completado", madrid("2026-10-20", "17:00")), sv("encurso", "en_camino", madrid("2026-10-20", "12:30")),
      sv("noche", "aceptado", madrid("2026-10-20", "23:59")),
    ];
    expect(pendientesHoy(l, ahora).map((s) => s.id)).toEqual(["encurso", "tarde1", "tarde2", "noche"]);
  });
  test("asignado → rechazar; aceptado/en camino → devolver", () => {
    expect(accionFinJornada("asignado")).toBe("rechazar");
    expect(accionFinJornada("aceptado")).toBe("devolver");
    expect(accionFinJornada("en_camino")).toBe("devolver");
    expect(accionFinJornada("recogido")).toBeNull();
  });
  test("textos", () => {
    expect(textoPendientes(["16:00", "18:30"])).toBe("2 servicios pendientes hoy (16:00, 18:30)");
    expect(textoPendientes(["16:00"])).toBe("1 servicio pendiente hoy (16:00)");
    expect(textoJornadaConPendientes("Marc", ["16:00", "18:30"])).toBe("⚠️ Marc ha cerrado la jornada con 2 servicios pendientes hoy (16:00, 18:30)");
    expect(textoDevueltosFinJornada("Marc", [madrid("2026-10-20", "16:00"), madrid("2026-10-20", "18:30")])).toBe("🔁 Marc ha terminado la jornada y ha devuelto 2 servicios de esta tarde");
    expect(franjaDevueltos([madrid("2026-10-20", "09:00")])).toBe("de esta mañana");
    expect(franjaDevueltos([madrid("2026-10-20", "09:00"), madrid("2026-10-20", "16:00")])).toBe("de hoy");
  });
  test("agrupa devoluciones por fin de jornada del mismo conductor (≤ 15 min)", () => {
    const ev = (id: number, actor: string, min: number, tipo = "devuelto", motivo: string | null = MOTIVO_FIN_JORNADA) =>
      ({ id, tipo, motivo, actor_id: actor, creado_en: new Date(ahora.getTime() + min * 60_000).toISOString() });
    const g = agruparFinJornada([ev(1, "m", 0), ev(2, "m", 1, "rechazado"), ev(3, "a", 1), ev(4, "m", 40), ev(5, "m", 2, "devuelto", "Avería")]);
    expect(g.map((x) => x.map((e) => e.id))).toEqual([[1, 2], [3], [4]]);
    expect(esDevolucionFinJornada({ tipo: "devuelto", motivo: " Fin de jornada " })).toBe(true);
    expect(esDevolucionFinJornada({ tipo: "cancelado", motivo: MOTIVO_FIN_JORNADA })).toBe(false);
  });
  test("cerradaHoy: jornada finalizada hoy y ninguna abierta", () => {
    const j = [
      { conductor_id: "marc", fin: madrid("2026-10-20", "11:00") },
      { conductor_id: "ana", fin: madrid("2026-10-20", "10:00") }, { conductor_id: "ana", fin: null },
      { conductor_id: "luis", fin: madrid("2026-10-19", "20:00") },
    ];
    expect([...cerradaHoy(j, ahora)]).toEqual(["marc"]);
  });
});

describe("CARGA / DESCARGA lejos del punto", () => {
  const salou = { lat: 41.0763, lng: 1.1416 }, cambrils = { lat: 41.067, lng: 1.0597 }, reus = { lat: 41.1474, lng: 1.1672 };
  const s = { origen_lat: salou.lat, origen_lng: salou.lng, destino_lat: reus.lat, destino_lng: reus.lng, origen_texto: "Salou – Plaza Europa", destino_texto: "Aeropuerto de Reus" };
  const en = madrid("2026-10-20", "12:00");
  const p = (pt: { lat: number; lng: number }, seg: number) => ({ ...pt, registrado_en: new Date(Date.parse(en) + seg * 1000).toISOString() });
  test("posición del evento: la más cercana en ±2 min; si no, la actual reciente; si no, null", () => {
    expect(posicionEnEvento([p(salou, -100), p(cambrils, 30), p(reus, -200)], en)).toEqual(cambrils);
    expect(posicionEnEvento([p(reus, -200)], en, p(salou, -240))).toEqual(salou);
    expect(posicionEnEvento([p(reus, -200)], en, p(salou, -600))).toBeNull();
    expect(posicionEnEvento([{ lat: 0, lng: 0, registrado_en: en }], en)).toBeNull();
  });
  test("CARGA a ~7 km de la recogida → anomalía; cerca → nada; sin GPS o sin coordenadas → nada", () => {
    const a = evaluarAnomalia("recogido", s, cambrils, 500);
    expect(a?.tipo).toBe("anomalia_carga");
    expect(a!.distanciaM).toBeGreaterThan(6500);
    expect(evaluarAnomalia("recogido", s, { lat: salou.lat + 0.002, lng: salou.lng }, 500)).toBeNull(); // ~220 m
    expect(evaluarAnomalia("recogido", s, null, 500)).toBeNull();
    expect(evaluarAnomalia("recogido", { ...s, origen_lat: null }, cambrils, 500)).toBeNull();
    expect(evaluarAnomalia("completado", s, reus, 500)).toBeNull();
    expect(evaluarAnomalia("completado", s, salou, 500)?.tipo).toBe("anomalia_descarga");
    expect(evaluarAnomalia("en_camino", s, cambrils, 500)).toBeNull();
    expect(evaluarAnomalia("recogido", s, { lat: salou.lat + 0.002, lng: salou.lng }, 100)?.tipo).toBe("anomalia_carga");
  });
  test("motivo ida y vuelta y texto para la central", () => {
    const m = motivoAnomalia({ distanciaM: 2300, lat: 41.07, lng: 1.06 });
    expect(m).toBe("d=2300;lat=41.07000;lng=1.06000");
    expect(leerMotivoAnomalia(m)).toEqual({ distanciaM: 2300, lat: 41.07, lng: 1.06 });
    expect(leerMotivoAnomalia("Avería")).toBeNull();
    expect(textoAnomalia("Marc", "anomalia_carga", 2300, "Salou – Plaza Europa", cambrils))
      .toBe("⚠️ Marc ha marcado CARGA a 2,3 km de la recogida (Salou – Plaza Europa) · está en Cambrils");
    expect(textoAnomalia("Marc", "anomalia_descarga", 800, null)).toBe("⚠️ Marc ha marcado DESCARGA a 800 m del destino");
  });
});
