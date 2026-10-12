import { describe, expect, it } from "vitest";
import { construirActividad, lugarBreve, lugarDetallado, pasoAlarma, ALARMA_CADA_MS, ALARMA_MAX, type EntradaActividad } from "@/lib/dominio/actividad";
import { zonaCercana, ZONAS } from "@/lib/dominio/zonas";
import { tecnicoInicial } from "@/lib/dominio/cierre";

const S = {
  id: "s1", cliente_nombre: "Lucía", origen_texto: "Salou – Plaza Europa", destino_texto: "Aeropuerto de Reus",
  fecha_hora_recogida: "2026-10-11T13:00:00Z", conductor_id: "c1", origen_pedido: "manual",
};
const gente = [{ id: "c1", nombre: "Marc", telefono: "600000001" }, { id: "c2", nombre: "Laia", telefono: null }];
const ev = (id: number, tipo: string, extra: Partial<{ motivo: string | null; actor_id: string | null; creado_en: string }> = {}) =>
  ({ id, servicio_id: "s1", tipo, motivo: null, actor_id: "c1", creado_en: `2026-10-11T12:${String(id).padStart(2, "0")}:00Z`, ...extra });
const entrada = (o: Partial<EntradaActividad> = {}): EntradaActividad => ({ servicios: [S], conductores: gente, ...o });

describe("zonaCercana", () => {
  it("en / cerca de / a X km de la localidad más próxima", () => {
    expect(zonaCercana(41.156, 1.107)?.texto).toBe("en Reus");
    expect(zonaCercana(41.145, 0.82)?.texto).toBe("en Falset");
    expect(zonaCercana(41.2, 0.9)?.texto).toMatch(/^cerca de /);
    expect(zonaCercana(42.5, 1.5)?.texto).toMatch(/^a \d+ km de /);
  });
  it("aeropuertos y estaciones con artículo", () => {
    expect(zonaCercana(41.1474, 1.1672)?.texto).toBe("en el Aeropuerto de Reus");
    expect(zonaCercana(41.27, 2.1)?.texto).toBe("cerca del Aeropuerto de Barcelona");
  });
  it("coordenadas no válidas → null; la lista tiene ~50 zonas sin repetir", () => {
    expect(zonaCercana(null, 1)).toBeNull();
    expect(zonaCercana(Number.NaN, 1)).toBeNull();
    expect(ZONAS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ZONAS.map((z) => z.nombre)).size).toBe(ZONAS.length);
  });
});

describe("lugares cortos", () => {
  it("trayecto: localidad o lugar conocido", () => {
    expect(lugarBreve("Salou – Plaza Europa")).toBe("Salou");
    expect(lugarBreve("Aeropuerto de Reus")).toBe("Aeropuerto de Reus");
    expect(lugarBreve("Hospital, Avinguda de Bellissens, Reus, Bajo Campo, Tarragona, Cataluña, 43204, España")).toBe("Reus");
  });
  it("recogida/entrega: localidad – lugar", () => {
    expect(lugarDetallado("Salou – Plaza Europa")).toBe("Salou – Plaza Europa");
    expect(lugarDetallado("Avinguda Carles Buïgas, Salou")).toBe("Salou – Avinguda Carles Buïgas");
    expect(lugarDetallado("Aeropuerto de Reus, Reus")).toBe("Aeropuerto de Reus");
  });
});

describe("construirActividad", () => {
  it("frases naturales del ciclo de un servicio, lo más nuevo arriba", () => {
    const { movimientos } = construirActividad(entrada({ eventos: [
      ev(1, "asignado", { actor_id: "op" }), ev(2, "aceptado"), ev(3, "en_camino"), ev(4, "recogido"), ev(5, "completado"),
    ] }));
    expect(movimientos.map((m) => m.texto)).toEqual([
      "Marc ha dejado a Lucía en Aeropuerto de Reus · queda libre",
      "Marc ha recogido a Lucía en Salou – Plaza Europa",
      "Marc va hacia la recogida de Lucía en Salou – Plaza Europa",
      "Marc ha aceptado el servicio de las 15:00 · Salou → Aeropuerto de Reus",
      "Servicio de las 15:00 enviado a Marc · Salou → Aeropuerto de Reus",
    ]);
    expect(movimientos.every((m) => m.gravedad === "info" && m.conductor === "Marc" && m.telefono === "600000001")).toBe(true);
    expect(movimientos[0]).toMatchObject({ hora: "14:05", detalle: "Lucía · 15:00 · Salou → Aeropuerto de Reus", servicioId: "s1", icono: "🏁" });
  });
  it("rechazo y plazo vencido son avisos; el rechazo nombra a quien rechaza", () => {
    const { movimientos } = construirActividad(entrada({
      servicios: [{ ...S, conductor_id: null }],
      eventos: [ev(1, "rechazado", { motivo: "No llego a tiempo", actor_id: "c2" }), ev(2, "expirado", { actor_id: null })],
    }));
    const [exp, rech] = movimientos;
    expect(rech).toMatchObject({ texto: "Laia ha rechazado: No llego a tiempo", gravedad: "aviso", conductor: "Laia" });
    expect(exp.gravedad).toBe("aviso");
  });
  it("envío: a quien respondió después (aunque ya lo haya rechazado) o al asignado ahora", () => {
    const { movimientos } = construirActividad(entrada({
      servicios: [{ ...S, conductor_id: null }],
      eventos: [ev(1, "asignado", { actor_id: "op" }), ev(2, "rechazado", { actor_id: "c2", motivo: "No" }), ev(3, "asignado", { actor_id: "op" })],
    }));
    expect(movimientos.map((m) => m.texto)).toEqual([
      "Servicio de las 15:00 enviado a un conductor · Salou → Aeropuerto de Reus",
      "Laia ha rechazado: No",
      "Servicio de las 15:00 enviado a Laia · Salou → Aeropuerto de Reus",
    ]);
  });
  it("servicio de otro día: lo indica; servicio desconocido: texto genérico", () => {
    const { movimientos } = construirActividad(entrada({
      servicios: [{ ...S, fecha_hora_recogida: "2026-10-12T13:00:00Z" }],
      eventos: [ev(1, "aceptado"), { ...ev(2, "aceptado"), servicio_id: "zz" }],
    }));
    expect(movimientos[1].texto).toBe("Marc ha aceptado el servicio de las 15:00 del 12/10 · Salou → Aeropuerto de Reus");
    expect(movimientos[0]).toMatchObject({ texto: "Marc ha aceptado un servicio", detalle: null });
  });
  it("avería: GRAVE, en mayúsculas, con conductor, zona (de la incidencia o del GPS) y descripción; pendiente hasta resolver", () => {
    const inc = { id: "i1", conductor_id: "c2", servicio_id: "s1", tipo: "averia", descripcion: "Pinchazo", lat: 41.156, lng: 1.107, creado_en: "2026-10-11T12:30:00Z", resuelta: false };
    const r = construirActividad(entrada({
      incidencias: [inc, { ...inc, id: "i2", tipo: "accidente", lat: null, lng: null, resuelta: true }],
      posiciones: [{ conductor_id: "c2", lat: 41.145, lng: 0.82 }],
    }));
    const de = (id: string) => r.movimientos.find((m) => m.id === id);
    expect(de("inc-i1")).toMatchObject({ texto: "⚠ AVERÍA · Laia · en Reus · Pinchazo", gravedad: "grave", pendiente: true, zona: "en Reus", incidenciaId: "i1" });
    expect(de("inc-i2")).toMatchObject({ texto: "⚠ ACCIDENTE · Laia · en Falset · Pinchazo", gravedad: "grave", pendiente: false, lat: 41.145 });
    expect(r.graves.map((g) => g.id)).toEqual(["inc-i1"]);
  });
  it("retraso / no presentado / checklist con fallos son avisos; checklist ok y jornadas, info", () => {
    const { movimientos } = construirActividad(entrada({
      incidencias: [{ id: "i3", conductor_id: "c1", servicio_id: null, tipo: "retraso", descripcion: "Atasco", lat: null, lng: null, creado_en: "2026-10-11T12:40:00Z", resuelta: false }],
      revisiones: [
        { id: "r1", conductor_id: "c1", vehiculo_id: "v1", con_fallos: true, observaciones: "Luz fundida", creado_en: "2026-10-11T07:00:00Z" },
        { id: "r2", conductor_id: "c2", vehiculo_id: "v1", con_fallos: false, creado_en: "2026-10-11T06:00:00Z" },
      ],
      jornadas: [{ id: "j1", conductor_id: "c2", inicio: "2026-10-11T05:00:00Z", fin: "2026-10-11T12:50:00Z" }],
      vehiculos: [{ id: "v1", matricula: "0001-TDL" }],
    }));
    expect(movimientos.map((m) => [m.gravedad, m.texto])).toEqual([
      ["info", "Laia ha terminado la jornada"],
      ["aviso", "Marc avisa: retraso · Atasco"],
      ["aviso", "Marc: checklist con fallos · 0001-TDL · Luz fundida"],
      ["info", "Laia ha pasado el checklist de 0001-TDL sin fallos"],
      ["info", "Laia ha empezado la jornada"],
    ]);
  });
  it("retraso en la recogida (servidor, sin actor): conductor asignado, trayecto y zona de su GPS; aviso", () => {
    const { movimientos } = construirActividad(entrada({
      eventos: [{ ...ev(52, "retraso_recogida", { actor_id: null, motivo: "Hora de recogida superada y sin recoger" }), creado_en: "2026-10-11T13:02:00Z" }],
      posiciones: [{ conductor_id: "c1", lat: 41.156, lng: 1.107 }],
    }));
    expect(movimientos[0]).toMatchObject({
      tipo: "retraso_recogida", gravedad: "aviso", conductorId: "c1", zona: "en Reus", lat: 41.156, pendiente: false,
      texto: "⏰ Marc llega tarde a la recogida de las 15:00 · Salou → Aeropuerto de Reus · en Reus",
    });
    const sinPos = construirActividad(entrada({ eventos: [{ ...ev(53, "retraso_recogida", { actor_id: null }), creado_en: "2026-10-11T13:02:00Z" }] }));
    expect(sinPos.movimientos[0].texto).toBe("⏰ Marc llega tarde a la recogida de las 15:00 · Salou → Aeropuerto de Reus");
  });
  it("límite, ventana `desde` (las graves pendientes antiguas siguen en `graves`) y sin duplicados", () => {
    const vieja = { id: "iv", conductor_id: "c1", servicio_id: null, tipo: "accidente", descripcion: "", lat: null, lng: null, creado_en: "2026-10-10T08:00:00Z", resuelta: false };
    const eventos = Array.from({ length: 50 }, (_, i) => ({ ...ev(1, "aceptado"), id: i + 1 }));
    const r = construirActividad(entrada({ eventos: [...eventos, eventos[0]], incidencias: [vieja], desde: new Date("2026-10-11T00:00:00Z") }), 40);
    expect(r.movimientos).toHaveLength(40);
    expect(new Set(r.movimientos.map((m) => m.id)).size).toBe(40);
    expect(r.movimientos.some((m) => m.id === "inc-iv")).toBe(false);
    expect(r.graves.map((g) => g.texto)).toEqual(["⚠ ACCIDENTE · Marc"]);
  });
});

describe("pasoAlarma", () => {
  it("suena al aparecer, repite cada 30 s hasta 5 veces y se reinicia con una grave nueva", () => {
    let e = pasoAlarma(null, ["a"], 0);
    expect(e.sonar).toBe(true);
    expect(pasoAlarma(e.estado, ["a"], ALARMA_CADA_MS - 1).sonar).toBe(false);
    let n = 1, t = 0;
    for (let i = 0; i < 10; i++) { t += ALARMA_CADA_MS; e = pasoAlarma(e.estado, ["a"], t); if (e.sonar) n++; }
    expect(n).toBe(ALARMA_MAX);
    e = pasoAlarma(e.estado, ["a", "b"], t + 1);
    expect(e).toMatchObject({ sonar: true, estado: { veces: 1 } });
  });
  it("sin graves pendientes: silencio y estado a cero; quitar una no vuelve a sonar", () => {
    expect(pasoAlarma({ ids: ["a"], veces: 2, ultima: 0 }, [], 1)).toEqual({ sonar: false, estado: null });
    expect(pasoAlarma({ ids: ["a", "b"], veces: 5, ultima: 0 }, ["a"], 99_999).sonar).toBe(false);
  });
});

describe("hoja de cierre en la actividad", () => {
  const tec = tecnicoInicial();
  const cierre = (o: Record<string, unknown>) => ({
    id: "k1", conductor_id: "c1", vehiculo_id: "v1", zonas: [] as string[], tecnico: { ...tec }, combustible: "1_2", comentario: "",
    gravedad: "ok" as const, creado_en: "2026-10-11T18:00:00Z", visto: false, ...o,
  });
  const veh = [{ id: "v1", matricula: "0001-TDL" }];
  it("grave: tarjeta roja fija con zonas y matrícula hasta «Visto»", () => {
    const r = construirActividad(entrada({ vehiculos: veh, cierres: [cierre({ gravedad: "grave", zonas: ["aleta_tras_der", "puerta_del_izq"], comentario: "Golpe al aparcar" })] }));
    const m = r.movimientos[0];
    expect(m).toMatchObject({ id: "cie-k1", tipo: "cierre_grave", gravedad: "grave", pendiente: true, cierreId: "k1", matricula: "0001-TDL", descripcion: "Golpe al aparcar" });
    expect(m.zonasDanadas).toEqual(["puerta_del_izq", "aleta_tras_der"]);
    expect(m.texto).toBe("🔴 Daños en Puerta del. izq., Aleta tras. der. · 0001-TDL · Marc · «Golpe al aparcar»");
    expect(r.graves.map((g) => g.id)).toEqual(["cie-k1"]);
    expect(construirActividad(entrada({ vehiculos: veh, cierres: [cierre({ gravedad: "grave", zonas: ["capo"], visto: true })] })).graves).toEqual([]);
  });
  it("mantenimiento → aviso; ok → info verde", () => {
    const r = construirActividad(entrada({ vehiculos: veh, cierres: [
      cierre({ id: "a", gravedad: "mantenimiento", tecnico: { ...tec, aceite: "falta" } }),
      cierre({ id: "b", conductor_id: "c2", creado_en: "2026-10-11T19:00:00Z" }),
    ] }));
    expect(r.movimientos.map((m) => [m.id, m.gravedad, m.texto])).toEqual([
      ["cie-b", "info", "🟢 Cierre sin incidencias · 0001-TDL · Laia"],
      ["cie-a", "aviso", "🟠 Falta aceite · 0001-TDL · Marc"],
    ]);
    expect(r.graves).toEqual([]);
  });
});
