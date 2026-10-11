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
