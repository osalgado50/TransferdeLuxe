import { beforeEach, expect, test } from "vitest";
import { ejecutarAccion, type RepoServicios } from "@/lib/servicios/acciones";
import type { Servicio } from "@/lib/dominio/tipos";

let db: Record<string, Servicio>; let eventos: { tipo: string; motivo?: string | null }[]; let acciones: Set<string>;
const repo: RepoServicios = {
  async obtener(id) { return db[id] ?? null; },
  async actualizar(id, c, esperado) { if (db[id].estado !== esperado) return false; db[id] = { ...db[id], ...c }; return true; },
  async insertarEvento(e) { eventos.push(e); },
  async registrarAccion(id) { if (acciones.has(id)) return false; acciones.add(id); return true; },
  async yaProcesada(id) { return acciones.has(id); },
  async liberarAccion(id) { acciones.delete(id); },
};
const op = { id: "op", rol: "operador" as const };
const c1 = { id: "c1", rol: "conductor" as const };

beforeEach(() => {
  db = { s1: { id: "s1", estado: "pendiente", conductor_id: null } as Servicio };
  eventos = []; acciones = new Set();
});

test("asignar y aceptar", async () => {
  expect(await ejecutarAccion(repo, { idAccion: "a1", servicioId: "s1", accion: "asignar", actor: op, conductorId: "c1", vehiculoId: "v1" }))
    .toEqual({ ok: true, estado: "asignado" });
  expect(db.s1.conductor_id).toBe("c1");
  expect(await ejecutarAccion(repo, { idAccion: "a2", servicioId: "s1", accion: "aceptar", actor: c1 })).toEqual({ ok: true, estado: "aceptado" });
  expect(eventos.map((e) => e.tipo)).toEqual(["asignado", "aceptado"]);
});

test("misma idAccion dos veces no avanza dos veces", async () => {
  db.s1 = { ...db.s1, estado: "en_camino", conductor_id: "c1" };
  const p = { idAccion: "x", servicioId: "s1", accion: "cargar" as const, actor: c1 };
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "recogido" });
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "recogido", duplicada: true });
  expect(eventos).toHaveLength(1);
});

test("conductor que ya no es el asignado recibe error y no cambia nada", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c2" };
  const r = await ejecutarAccion(repo, { idAccion: "y", servicioId: "s1", accion: "aceptar", actor: c1 });
  expect(r).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
  expect(db.s1.estado).toBe("asignado");
});

test("rechazar exige motivo y deja incidencia para la central", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c1" };
  expect((await ejecutarAccion(repo, { idAccion: "r0", servicioId: "s1", accion: "rechazar", actor: c1 })).ok).toBe(false);
  expect((await ejecutarAccion(repo, { idAccion: "r1", servicioId: "s1", accion: "rechazar", actor: c1, motivo: "Otro" })).ok).toBe(false);
  expect(await ejecutarAccion(repo, { idAccion: "r2", servicioId: "s1", accion: "rechazar", actor: c1, motivo: "Avería" }))
    .toEqual({ ok: true, estado: "pendiente" });
  expect(db.s1).toMatchObject({ conductor_id: null, ultima_incidencia: "rechazado: Avería", incidencia_vista: false });
});

test("carrera: si el estado cambió entre leer y escribir, error", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c1" };
  const lento: RepoServicios = { ...repo, async actualizar() { return false; } };
  expect(await ejecutarAccion(lento, { idAccion: "z", servicioId: "s1", accion: "aceptar", actor: c1 }))
    .toEqual({ ok: false, error: "El servicio cambió mientras tanto; recarga" });
});

test("asignar sin conductor es error", async () => {
  expect((await ejecutarAccion(repo, { idAccion: "q", servicioId: "s1", accion: "asignar", actor: op })).ok).toBe(false);
});

test("actualizar devuelve false: la idAccion se libera y el reintento se aplica", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c1" };
  const p = { idAccion: "w", servicioId: "s1", accion: "aceptar" as const, actor: c1 };
  const falla: RepoServicios = { ...repo, async actualizar() { return false; } };
  expect((await ejecutarAccion(falla, p)).ok).toBe(false);
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "aceptado" });
});

test("actualizar lanza: se relanza y la idAccion se libera", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c1" };
  const p = { idAccion: "t", servicioId: "s1", accion: "aceptar" as const, actor: c1 };
  const rompe: RepoServicios = { ...repo, async actualizar() { throw new Error("boom"); } };
  await expect(ejecutarAccion(rompe, p)).rejects.toThrow("boom");
  expect(acciones.has("t")).toBe(false);
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "aceptado" });
});

test("con actualizarConEvento: cambio y evento en una sola llamada (sin insertarEvento aparte)", async () => {
  const llamadas: string[] = [];
  const repo: RepoServicios = {
    obtener: async () => ({ id: "s1", estado: "aceptado", conductor_id: "c1" } as never),
    actualizar: async () => { llamadas.push("actualizar"); return true; },
    insertarEvento: async () => { llamadas.push("insertarEvento"); },
    actualizarConEvento: async (_id, cambios, esperado, e) => { llamadas.push(`atomica:${esperado}->${cambios.estado}:${e.tipo}`); return true; },
    registrarAccion: async () => true, yaProcesada: async () => false, liberarAccion: async () => {},
  };
  const r = await ejecutarAccion(repo, { idAccion: "a1", servicioId: "s1", accion: "salir", actor: { id: "c1", rol: "conductor" } });
  expect(r.ok).toBe(true);
  expect(llamadas).toEqual(["atomica:aceptado->en_camino:en_camino"]);
});

test("devolver: exige motivo, deja el servicio sin conductor y alerta a la central", async () => {
  db.s1 = { ...db.s1, estado: "en_camino", conductor_id: "c1", vehiculo_id: "v1" } as Servicio;
  expect((await ejecutarAccion(repo, { idAccion: "d0", servicioId: "s1", accion: "devolver", actor: c1 })).ok).toBe(false);
  expect((await ejecutarAccion(repo, { idAccion: "d1", servicioId: "s1", accion: "devolver", actor: c1, motivo: " Otro " })).ok).toBe(false);
  const p = { idAccion: "d2", servicioId: "s1", accion: "devolver" as const, actor: c1, motivo: "Avería" };
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "pendiente" });
  expect(db.s1).toMatchObject({ estado: "pendiente", conductor_id: null, vehiculo_id: null, ultima_incidencia: "devuelto: Avería", incidencia_vista: false });
  expect(eventos.at(-1)).toMatchObject({ tipo: "devuelto", motivo: "Avería" });
  // Reenvío desde la cola offline: idempotente.
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "pendiente", duplicada: true });
  expect(eventos.filter((e) => e.tipo === "devuelto")).toHaveLength(1);
});

test("devolver: no con pasajeros a bordo", async () => {
  db.s1 = { ...db.s1, estado: "recogido", conductor_id: "c1" };
  expect((await ejecutarAccion(repo, { idAccion: "d3", servicioId: "s1", accion: "devolver", actor: c1, motivo: "Avería" })).ok).toBe(false);
  expect(db.s1.estado).toBe("recogido");
});

// ── Carreras central ↔ conductor (auditoría de estrés, 15/10/2026) ──
test("reasignar de A a B mientras A pulsa «Aceptar» con la ficha ya leída: no queda aceptado a nombre de B", async () => {
  db.s1 = { id: "s1", estado: "asignado", conductor_id: "c1" } as Servicio;
  // Repo que compara también el conductor (como el RPC 0034) y que simula que la central reasignó justo después de leer.
  let leido = false;
  const carrera: RepoServicios = {
    ...repo,
    async obtener(id) { const s = { ...db[id] }; if (!leido) { leido = true; db[id] = { ...db[id], conductor_id: "c2" }; } return s; },
    async actualizar(id, c, esperado, conductor) {
      if (db[id].estado !== esperado || (conductor !== undefined && db[id].conductor_id !== conductor)) return false;
      db[id] = { ...db[id], ...c }; return true;
    },
  };
  const r = await ejecutarAccion(carrera, { idAccion: "x1", servicioId: "s1", accion: "aceptar", actor: c1 });
  expect(r).toEqual({ ok: false, error: "El servicio cambió mientras tanto; recarga" });
  expect(db.s1).toMatchObject({ estado: "asignado", conductor_id: "c2" });
});

test("estadoEsperado: la central no deshace la CARGA creyendo deshacer la salida", async () => {
  db.s1 = { id: "s1", estado: "recogido", conductor_id: "c1" } as Servicio;
  const r = await ejecutarAccion(repo, { idAccion: "x2", servicioId: "s1", accion: "deshacer", actor: { ...op, central: true }, estadoEsperado: "en_camino" });
  expect(r.ok).toBe(false);
  expect(db.s1.estado).toBe("recogido");
});

test("aceptar, cancelar y subcontratar limpian la alerta («Sin respuesta», rechazado…)", async () => {
  db.s1 = { id: "s1", estado: "asignado", conductor_id: "c1", incidencia_vista: false, ultima_incidencia: "expirado" } as Servicio;
  await ejecutarAccion(repo, { idAccion: "x3", servicioId: "s1", accion: "aceptar", actor: c1 });
  expect(db.s1.incidencia_vista).toBe(true);
  db.s2 = { id: "s2", estado: "pendiente", conductor_id: null, incidencia_vista: false, ultima_incidencia: "rechazado: lejos" } as Servicio;
  await ejecutarAccion(repo, { idAccion: "x4", servicioId: "s2", accion: "cancelar", actor: op, motivo: "Cliente" });
  expect(db.s2.incidencia_vista).toBe(true);
});

const central = { id: "op", rol: "operador" as const, central: true };
test("servicio en marcha: la central solo actúa si lo veía así (un arrastre o un diálogo antiguos no se lo quitan)", async () => {
  db.s1 = { ...db.s1, estado: "en_camino", conductor_id: "c1" };
  const r = await ejecutarAccion(repo, { idAccion: "g1", servicioId: "s1", accion: "reasignar", actor: central, conductorId: "c2" });
  expect(r).toMatchObject({ ok: false });
  expect(db.s1).toMatchObject({ estado: "en_camino", conductor_id: "c1" });
  for (const accion of ["subcontratar", "cancelar", "desasignar", "completar"] as const)
    expect((await ejecutarAccion(repo, { idAccion: `g-${accion}`, servicioId: "s1", accion, actor: central })).ok).toBe(false);
  // Viéndolo en camino, sí.
  expect(await ejecutarAccion(repo, { idAccion: "g2", servicioId: "s1", accion: "reasignar", actor: central, conductorId: "c2", estadoEsperado: "en_camino" }))
    .toEqual({ ok: true, estado: "asignado" });
});

test("relevo con el cliente a bordo: sigue recogido con el nuevo conductor; al mismo conductor no", async () => {
  db.s1 = { ...db.s1, estado: "recogido", conductor_id: "c1" };
  expect((await ejecutarAccion(repo, { idAccion: "r0", servicioId: "s1", accion: "reasignar", actor: central, conductorId: "c1", estadoEsperado: "recogido" })).ok).toBe(false);
  expect(await ejecutarAccion(repo, { idAccion: "r1", servicioId: "s1", accion: "reasignar", actor: central, conductorId: "c2", estadoEsperado: "recogido" }))
    .toEqual({ ok: true, estado: "recogido" });
  expect(db.s1.conductor_id).toBe("c2");
});

test("deshacer un «Cerrar como completado» de la central vuelve al estado que tenía, no a «pasajeros a bordo»", async () => {
  const conEventos: RepoServicios = { ...repo, async eventosServicio() { return [...eventos].reverse().map((e, i) => ({ id: i, tipo: e.tipo, actor_id: "op", creado_en: new Date().toISOString(), motivo: e.motivo ?? null })); } };
  db.s1 = { ...db.s1, estado: "aceptado", conductor_id: "c1" };
  expect(await ejecutarAccion(conEventos, { idAccion: "k1", servicioId: "s1", accion: "completar", actor: central })).toEqual({ ok: true, estado: "completado" });
  expect(eventos.at(-1)?.motivo).toBe("Cerrado por la central (desde aceptado)");
  expect(await ejecutarAccion(conEventos, { idAccion: "k2", servicioId: "s1", accion: "deshacer", actor: central })).toEqual({ ok: true, estado: "aceptado" });
  expect(eventos.at(-1)?.motivo).toBe("Deshecho por la central: cierre");
});
