import { describe, expect, test } from "vitest";
import { transicion, ACCION_SIGUIENTE_CONDUCTOR } from "@/lib/dominio/estados";

const operador = { rol: "operador" as const, esAsignado: false };
const conductor = { rol: "conductor" as const, esAsignado: true };
const otroConductor = { rol: "conductor" as const, esAsignado: false };

describe("transicion", () => {
  test("flujo completo feliz", () => {
    expect(transicion("pendiente", "asignar", operador)).toEqual({ ok: true, nuevo: "asignado", evento: "asignado" });
    expect(transicion("asignado", "aceptar", conductor)).toMatchObject({ ok: true, nuevo: "aceptado" });
    expect(transicion("aceptado", "salir", conductor)).toMatchObject({ ok: true, nuevo: "en_camino" });
    expect(transicion("en_camino", "cargar", conductor)).toMatchObject({ ok: true, nuevo: "recogido" });
    expect(transicion("recogido", "descargar", conductor)).toMatchObject({ ok: true, nuevo: "completado" });
  });
  test("rechazar vuelve a pendiente", () => {
    expect(transicion("asignado", "rechazar", conductor)).toEqual({ ok: true, nuevo: "pendiente", evento: "rechazado" });
  });
  test("no se puede descargar sin cargar", () => {
    expect(transicion("en_camino", "descargar", conductor).ok).toBe(false);
  });
  test("un conductor no asignado no puede actuar", () => {
    const r = transicion("asignado", "aceptar", otroConductor);
    expect(r).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
  });
  test("un conductor no puede asignar ni cancelar", () => {
    expect(transicion("pendiente", "asignar", conductor).ok).toBe(false);
    expect(transicion("aceptado", "cancelar", conductor).ok).toBe(false);
  });
  test("la central cancela cualquier servicio abierto, también en camino o con el cliente a bordo; no los cerrados", () => {
    for (const e of ["pendiente", "asignado", "aceptado", "en_camino", "recogido"] as const)
      expect(transicion(e, "cancelar", operador)).toMatchObject({ ok: true, nuevo: "cancelado" });
    for (const e of ["completado", "cancelado", "subcontratado"] as const) expect(transicion(e, "cancelar", operador).ok).toBe(false);
  });
  test("reasignar, quitar o cerrar desde cualquier estado con conductor (no responde y no hay forma de contactarle)", () => {
    for (const e of ["asignado", "aceptado", "en_camino"] as const) {
      expect(transicion(e, "reasignar", operador)).toMatchObject({ ok: true, nuevo: "asignado", evento: "reasignado" });
      expect(transicion(e, "desasignar", operador)).toMatchObject({ ok: true, nuevo: "pendiente", evento: "desasignado" });
    }
    for (const e of ["asignado", "aceptado", "en_camino", "recogido"] as const)
      expect(transicion(e, "completar", operador)).toMatchObject({ ok: true, nuevo: "completado", evento: "completado" });
    // Con el cliente a bordo: relevo (sigue recogido con el nuevo conductor) y no se le puede quitar sin más.
    expect(transicion("recogido", "reasignar", operador)).toMatchObject({ ok: true, nuevo: "recogido", evento: "reasignado" });
    expect(transicion("recogido", "desasignar", operador).ok).toBe(false);
    expect(transicion("pendiente", "reasignar", operador).ok).toBe(false);
    expect(transicion("pendiente", "completar", operador).ok).toBe(false);
    expect(transicion("completado", "reasignar", operador).ok).toBe(false);
  });
  test("subcontratar cualquier servicio abierto", () => {
    for (const e of ["pendiente", "asignado", "aceptado", "en_camino", "recogido"] as const)
      expect(transicion(e, "subcontratar", operador)).toMatchObject({ ok: true, nuevo: "subcontratado" });
    expect(transicion("completado", "subcontratar", operador).ok).toBe(false);
  });
  test("el conductor no puede cerrar como la central", () => {
    expect(transicion("en_camino", "completar", conductor)).toEqual({ ok: false, error: "No tienes permiso para esta acción" });
  });
  test("botón siguiente del conductor", () => {
    expect(ACCION_SIGUIENTE_CONDUCTOR.aceptado?.accion).toBe("salir");
    expect(ACCION_SIGUIENTE_CONDUCTOR.en_camino?.etiqueta).toMatch(/CARGA/);
    expect(ACCION_SIGUIENTE_CONDUCTOR.recogido?.etiqueta).toMatch(/DESCARGA/);
  });
});

describe("operador que también conduce", () => {
  const jefe = { rol: "operador" as const, esAsignado: true, conduce: true };
  test("ejecuta las acciones de conductor sobre lo suyo", () => {
    expect(transicion("asignado", "aceptar", jefe)).toMatchObject({ ok: true, nuevo: "aceptado" });
    expect(transicion("asignado", "rechazar", jefe)).toMatchObject({ ok: true, nuevo: "pendiente" });
    expect(transicion("aceptado", "salir", jefe)).toMatchObject({ ok: true });
    expect(transicion("en_camino", "cargar", jefe)).toMatchObject({ ok: true });
    expect(transicion("recogido", "descargar", jefe)).toMatchObject({ ok: true });
  });
  test("no sobre servicios de otro", () => {
    expect(transicion("asignado", "aceptar", { ...jefe, esAsignado: false })).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
  });
  test("sin conduce, un operador no puede", () => {
    expect(transicion("asignado", "aceptar", { rol: "operador", esAsignado: true }).ok).toBe(false);
  });
  test("sigue pudiendo asignar como operador", () => {
    expect(transicion("pendiente", "asignar", jefe).ok).toBe(true);
  });
});

describe("devolver («No puedo hacer este servicio»)", () => {
  test("desde aceptado o en camino → pendiente, evento «devuelto»", () => {
    expect(transicion("aceptado", "devolver", conductor)).toEqual({ ok: true, nuevo: "pendiente", evento: "devuelto" });
    expect(transicion("en_camino", "devolver", conductor)).toEqual({ ok: true, nuevo: "pendiente", evento: "devuelto" });
  });
  test("no con el cliente a bordo ni antes de aceptar", () => {
    expect(transicion("recogido", "devolver", conductor).ok).toBe(false);
    expect(transicion("asignado", "devolver", conductor).ok).toBe(false);
    expect(transicion("completado", "devolver", conductor).ok).toBe(false);
  });
  test("solo el conductor asignado (no otro conductor ni la central)", () => {
    expect(transicion("aceptado", "devolver", otroConductor)).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
    expect(transicion("aceptado", "devolver", operador).ok).toBe(false);
    expect(transicion("en_camino", "devolver", { rol: "operador", esAsignado: true, conduce: true })).toMatchObject({ ok: true, nuevo: "pendiente" });
  });
});
