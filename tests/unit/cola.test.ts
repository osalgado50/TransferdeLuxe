import { expect, test } from "vitest";
import { ColaAcciones } from "@/lib/offline/cola";

const memoria = () => { let v: string | null = null; return { get: () => v, set: (x: string) => { v = x; } }; };

test("encola y envía en orden", async () => {
  const enviadas: string[] = [];
  const c = new ColaAcciones(memoria(), async (a) => { enviadas.push(a.accion); return { ok: true }; });
  c.encolar({ idAccion: "1", servicioId: "s", accion: "salir" });
  c.encolar({ idAccion: "2", servicioId: "s", accion: "cargar" });
  expect(await c.vaciar()).toEqual({ enviadas: 2, errores: [] });
  expect(enviadas).toEqual(["salir", "cargar"]);
  expect(c.pendientes()).toEqual([]);
});

test("sin red: conserva la cola y reintenta luego", async () => {
  let red = false;
  const c = new ColaAcciones(memoria(), async () => { if (!red) throw new Error("offline"); return { ok: true }; });
  c.encolar({ idAccion: "1", servicioId: "s", accion: "cargar" });
  expect(await c.vaciar()).toEqual({ enviadas: 0, errores: [] });
  expect(c.pendientes()).toHaveLength(1);
  red = true;
  expect((await c.vaciar()).enviadas).toBe(1);
});

test("rechazada por el servidor: se descarta y se informa", async () => {
  const c = new ColaAcciones(memoria(), async () => ({ ok: false, error: "Este servicio ya no está asignado a ti" }));
  c.encolar({ idAccion: "1", servicioId: "s", accion: "cargar" });
  expect(await c.vaciar()).toEqual({ enviadas: 0, errores: ["Este servicio ya no está asignado a ti"] });
  expect(c.pendientes()).toEqual([]);
});
