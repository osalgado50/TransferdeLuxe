import { beforeEach, describe, expect, test, vi, afterEach } from "vitest";
import {
  comprobarDeshacer, confirmacionDistancia, formatoCuentaAtras, leerDeshecho, preguntaDeshacer, restanteDeshacerMs, ultimoEventoAccion,
  VENTANA_DESHACER_MS, type EventoPaso,
} from "@/lib/dominio/deshacer";
import { transicion } from "@/lib/dominio/estados";
import { ejecutarAccion, type RepoServicios } from "@/lib/servicios/acciones";
import { construirActividad } from "@/lib/dominio/actividad";
import { construirAvisos } from "@/lib/dominio/avisosCentral";
import { sonidoDeEvento } from "@/lib/dominio/sonidos";
import { etiquetaEvento } from "@/lib/dominio/navegacion";
import type { Servicio } from "@/lib/dominio/tipos";

const T0 = Date.parse("2026-10-11T17:50:00Z");
const en = (min: number) => new Date(T0 + min * 60_000).toISOString();
const evp = (id: number, tipo: string, min: number, actor_id: string | null = "c1"): EventoPaso => ({ id, tipo, actor_id, creado_en: en(min) });

describe("transición «deshacer»", () => {
  const cond = { rol: "conductor" as const, esAsignado: true };
  test("completado→recogido, recogido→en_camino, en_camino→aceptado; evento «deshecho»", () => {
    expect(transicion("completado", "deshacer", cond)).toEqual({ ok: true, nuevo: "recogido", evento: "deshecho" });
    expect(transicion("recogido", "deshacer", cond)).toEqual({ ok: true, nuevo: "en_camino", evento: "deshecho" });
    expect(transicion("en_camino", "deshacer", cond)).toEqual({ ok: true, nuevo: "aceptado", evento: "deshecho" });
  });
  test("nada que deshacer en otros estados", () => {
    for (const e of ["pendiente", "asignado", "aceptado", "cancelado", "subcontratado"] as const) expect(transicion(e, "deshacer", cond).ok).toBe(false);
  });
  test("solo el conductor asignado (o el jefe que conduce lo suyo) o la central", () => {
    expect(transicion("completado", "deshacer", { ...cond, esAsignado: false })).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
    expect(transicion("completado", "deshacer", { rol: "operador", esAsignado: true }).ok).toBe(false); // operador sin «conduce» desde la app del conductor
    expect(transicion("completado", "deshacer", { rol: "operador", conduce: true, esAsignado: true }).ok).toBe(true);
    expect(transicion("completado", "deshacer", { rol: "operador", esAsignado: false, central: true }).ok).toBe(true);
    expect(transicion("completado", "deshacer", { rol: "conductor", esAsignado: true, central: true }).ok).toBe(false);
  });
});

describe("comprobarDeshacer (ventana de 10 min y último paso)", () => {
  const yo = { id: "c1" };
  test("su último paso, dentro de los 10 min: ok con motivo y tiempo restante", () => {
    const r = comprobarDeshacer("completado", [evp(1, "recogido", -30), evp(2, "completado", 0)], yo, new Date(T0 + 19_000));
    expect(r).toEqual({ ok: true, hacia: "recogido", nombre: "descarga", motivo: "Deshecho por el conductor: descarga", restanteMs: VENTANA_DESHACER_MS - 19_000 });
  });
  test("pasados 10 min: rechazo", () => {
    const r = comprobarDeshacer("completado", [evp(2, "completado", 0)], yo, new Date(T0 + VENTANA_DESHACER_MS + 1));
    expect(r).toEqual({ ok: false, error: "Han pasado más de 10 minutos: pide a la central que lo deshaga" });
  });
  test("los eventos informativos posteriores (llegando, retraso) no cuentan", () => {
    const evs = [evp(1, "en_camino", 0), evp(2, "retraso_recogida", 2, null), evp(3, "llegando_recogida", 3)];
    expect(comprobarDeshacer("en_camino", evs, yo, new Date(T0 + 4 * 60_000)).ok).toBe(true);
  });
  test("acción posterior de la central (p. ej. ya deshizo ella): rechazo", () => {
    const evs = [evp(1, "completado", 0), evp(2, "deshecho", 1, "op")];
    expect(comprobarDeshacer("recogido", evs, yo, new Date(T0 + 2 * 60_000)))
      .toEqual({ ok: false, error: "La central ha cambiado el servicio después: pídele que lo corrija" });
  });
  test("solo el último paso: tras deshacer la descarga no se puede deshacer también la carga", () => {
    const evs = [evp(1, "recogido", 0), evp(2, "completado", 1), evp(3, "deshecho", 2)];
    expect(comprobarDeshacer("recogido", evs, yo, new Date(T0 + 3 * 60_000))).toEqual({ ok: false, error: "Solo puedes deshacer tu último paso" });
  });
  test("paso hecho por otra persona: rechazo; la central puede siempre (sin límite de tiempo)", () => {
    expect(comprobarDeshacer("completado", [evp(1, "completado", 0, "c2")], yo, new Date(T0)).ok).toBe(false);
    expect(comprobarDeshacer("completado", [evp(1, "completado", -600, "c2")], { id: "op", central: true }, new Date(T0)))
      .toEqual({ ok: true, hacia: "recogido", nombre: "descarga", motivo: "Deshecho por la central: descarga", restanteMs: null });
  });
  test("último evento por instante y, a igualdad, por id", () => {
    expect(ultimoEventoAccion([evp(5, "completado", 0), evp(4, "recogido", 0), evp(9, "llegando_destino", 5)])?.id).toBe(5);
    expect(ultimoEventoAccion([])).toBeNull();
  });
  test("restante para el botón y formato de la cuenta atrás", () => {
    expect(restanteDeshacerMs("completado", evp(1, "completado", 0), "c1", new Date(T0 + 19_000))).toBe(581_000);
    expect(restanteDeshacerMs("completado", evp(1, "deshecho", 0), "c1", new Date(T0))).toBeNull();
    expect(restanteDeshacerMs("completado", null, "c1", new Date(T0))).toBeNull();
    expect(formatoCuentaAtras(581_000)).toBe("9:41");
    expect(formatoCuentaAtras(600_000)).toBe("10:00");
    expect(formatoCuentaAtras(-5)).toBe("0:00");
  });
  test("pregunta de confirmación y lectura del motivo", () => {
    expect(preguntaDeshacer("completado")).toBe("¿Deshacer la descarga? El servicio volverá a «pasajeros a bordo» (sin terminar).");
    expect(preguntaDeshacer("aceptado")).toBeNull();
    expect(leerDeshecho("Deshecho por el conductor: descarga")).toEqual({ nombre: "descarga", central: false });
    expect(leerDeshecho("Deshecho por la central: carga")).toEqual({ nombre: "carga", central: true });
    expect(leerDeshecho(null)).toEqual({ nombre: null, central: false });
  });
});

describe("confirmación por distancia (CARGA/DESCARGA lejos del objetivo)", () => {
  test("DESCARGA a 2,3 km del destino pide confirmación", () => {
    expect(confirmacionDistancia("descargar", { tipo: "destino", distanciaM: 2300 })).toBe("Aún estás a 2,3 km del destino. ¿Finalizar igualmente?");
  });
  test("CARGA lejos de la recogida pide confirmación", () => {
    expect(confirmacionDistancia("cargar", { tipo: "recogida", distanciaM: 450 })).toBe("Aún estás a 450 m de la recogida. ¿Marcar CARGA igualmente?");
  });
  test("cerca (≤ 300 m), sin GPS, distancia de otro objetivo o SALIR: sin confirmación", () => {
    expect(confirmacionDistancia("descargar", { tipo: "destino", distanciaM: 300 })).toBeNull();
    expect(confirmacionDistancia("descargar", null)).toBeNull();
    expect(confirmacionDistancia("descargar", { tipo: "recogida", distanciaM: 5000 })).toBeNull();
    expect(confirmacionDistancia("salir", { tipo: "recogida", distanciaM: 5000 })).toBeNull();
    expect(confirmacionDistancia("descargar", { tipo: "destino", distanciaM: Number.NaN })).toBeNull();
  });
});

describe("ejecutarAccion «deshacer» (servidor)", () => {
  let db: Record<string, Servicio>; let eventos: (EventoPaso & { motivo?: string | null })[]; let acciones: Set<string>; let n: number;
  const repo: RepoServicios = {
    async obtener(id) { return db[id] ?? null; },
    async actualizar() { throw new Error("debe usar la transacción"); },
    async insertarEvento() { throw new Error("debe usar la transacción"); },
    async actualizarConEvento(id, c, esperado, e) {
      if (db[id].estado !== esperado) return false;
      db[id] = { ...db[id], ...c };
      eventos.push({ id: ++n, tipo: e.tipo, actor_id: e.actor_id, motivo: e.motivo, creado_en: new Date().toISOString() });
      return true;
    },
    async eventosServicio() { return [...eventos]; },
    async registrarAccion(id) { if (acciones.has(id)) return false; acciones.add(id); return true; },
    async yaProcesada(id) { return acciones.has(id); },
    async liberarAccion(id) { acciones.delete(id); },
  };
  const c1 = { id: "c1", rol: "conductor" as const };
  const op = { id: "op", rol: "operador" as const, central: true };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(T0);
    db = { s1: { id: "s1", estado: "recogido", conductor_id: "c1" } as Servicio };
    eventos = []; acciones = new Set(); n = 0;
  });
  afterEach(() => { vi.useRealTimers(); });

  test("DESCARGA → deshacer → recogido → DESCARGA otra vez; idempotente por idAccion", async () => {
    expect(await ejecutarAccion(repo, { idAccion: "a1", servicioId: "s1", accion: "descargar", actor: c1 })).toEqual({ ok: true, estado: "completado" });
    vi.setSystemTime(T0 + 60_000);
    const p = { idAccion: "a2", servicioId: "s1", accion: "deshacer" as const, actor: c1 };
    expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "recogido" });
    expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "recogido", duplicada: true });
    expect(await ejecutarAccion(repo, { idAccion: "a3", servicioId: "s1", accion: "descargar", actor: c1 })).toEqual({ ok: true, estado: "completado" });
    expect(eventos.map((e) => [e.tipo, e.motivo ?? null])).toEqual([
      ["completado", null], ["deshecho", "Deshecho por el conductor: descarga"], ["completado", null],
    ]);
  });
  test("pasados 10 min el conductor no puede, la central sí", async () => {
    await ejecutarAccion(repo, { idAccion: "a1", servicioId: "s1", accion: "descargar", actor: c1 });
    vi.setSystemTime(T0 + 11 * 60_000);
    const r = await ejecutarAccion(repo, { idAccion: "a2", servicioId: "s1", accion: "deshacer", actor: c1 });
    expect(r).toEqual({ ok: false, error: "Han pasado más de 10 minutos: pide a la central que lo deshaga" });
    expect(acciones.has("a2")).toBe(false); // un rechazo no consume la idAccion
    expect(db.s1.estado).toBe("completado");
    expect(await ejecutarAccion(repo, { idAccion: "a3", servicioId: "s1", accion: "deshacer", actor: op })).toEqual({ ok: true, estado: "recogido" });
    expect(eventos.at(-1)).toMatchObject({ tipo: "deshecho", actor_id: "op", motivo: "Deshecho por la central: descarga" });
  });
  test("si la central actuó después, el conductor no puede deshacer", async () => {
    await ejecutarAccion(repo, { idAccion: "a1", servicioId: "s1", accion: "descargar", actor: c1 });
    vi.setSystemTime(T0 + 30_000);
    await ejecutarAccion(repo, { idAccion: "a2", servicioId: "s1", accion: "deshacer", actor: op }); // completado → recogido
    vi.setSystemTime(T0 + 60_000);
    const r = await ejecutarAccion(repo, { idAccion: "a3", servicioId: "s1", accion: "deshacer", actor: c1 });
    expect(r).toEqual({ ok: false, error: "La central ha cambiado el servicio después: pídele que lo corrija" });
    expect(db.s1.estado).toBe("recogido");
  });
  test("sin lectura de eventos en el repo, el conductor no puede (no se salta la ventana)", async () => {
    db.s1.estado = "completado";
    const sinEventos = { ...repo, eventosServicio: undefined };
    expect(await ejecutarAccion(sinEventos, { idAccion: "x", servicioId: "s1", accion: "deshacer", actor: c1 }))
      .toEqual({ ok: false, error: "No se puede comprobar el último paso" });
  });
});

describe("la central se entera", () => {
  const S = { id: "s1", cliente_nombre: "Lucía", origen_texto: "Salou – Plaza Europa", destino_texto: "Aeropuerto de Reus",
    fecha_hora_recogida: "2026-10-11T17:50:00Z", conductor_id: "c1", origen_pedido: "manual" };
  const ev = (motivo: string, actor_id: string) => ({ id: 70, servicio_id: "s1", tipo: "deshecho", motivo, actor_id, creado_en: "2026-10-11T18:30:00Z" });
  test("Actividad en vivo: «↩ Marc ha deshecho la descarga del servicio de las 19:50» (aviso)", () => {
    const { movimientos } = construirActividad({ servicios: [S], conductores: [{ id: "c1", nombre: "Marc" }], eventos: [ev("Deshecho por el conductor: descarga", "c1")] });
    expect(movimientos[0]).toMatchObject({ tipo: "deshecho", icono: "↩️", gravedad: "aviso", conductorId: "c1",
      texto: "↩ Marc ha deshecho la descarga del servicio de las 19:50" });
    const central = construirActividad({ servicios: [S], conductores: [{ id: "c1", nombre: "Marc" }, { id: "op", nombre: "Jefa" }], eventos: [ev("Deshecho por la central: carga", "op")] });
    expect(central.movimientos[0]).toMatchObject({ conductorId: "c1", texto: "↩ La central ha deshecho la carga del servicio de las 19:50 (Marc)" });
  });
  test("sonido de aviso, etiqueta del historial y push solo si lo deshizo el conductor", () => {
    expect(sonidoDeEvento("deshecho")).toBe("incidencia");
    expect(etiquetaEvento("deshecho")).toBe("Paso deshecho");
    const base = { incidencias: [], revisiones: [], servicios: new Map([["s1", S]]), nombres: new Map([["c1", "Marc"]]), matriculas: new Map() };
    expect(construirAvisos({ ...base, eventos: [ev("Deshecho por el conductor: descarga", "c1")] }).map((a) => a.titulo)).toEqual(["↩ Marc ha deshecho la descarga"]);
    expect(construirAvisos({ ...base, eventos: [ev("Deshecho por la central: descarga", "op")] })).toEqual([]);
  });
});
