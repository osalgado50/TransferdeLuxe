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
  test("operador cancela hasta aceptado, no después", () => {
    expect(transicion("aceptado", "cancelar", operador)).toMatchObject({ ok: true, nuevo: "cancelado" });
    expect(transicion("en_camino", "cancelar", operador).ok).toBe(false);
  });
  test("reasignar desde asignado o aceptado", () => {
    expect(transicion("aceptado", "reasignar", operador)).toMatchObject({ ok: true, nuevo: "asignado", evento: "reasignado" });
    expect(transicion("recogido", "reasignar", operador).ok).toBe(false);
  });
  test("subcontratar solo desde pendiente", () => {
    expect(transicion("pendiente", "subcontratar", operador)).toMatchObject({ ok: true, nuevo: "subcontratado" });
    expect(transicion("asignado", "subcontratar", operador).ok).toBe(false);
  });
  test("botón siguiente del conductor", () => {
    expect(ACCION_SIGUIENTE_CONDUCTOR.aceptado?.accion).toBe("salir");
    expect(ACCION_SIGUIENTE_CONDUCTOR.en_camino?.etiqueta).toMatch(/CARGA/);
    expect(ACCION_SIGUIENTE_CONDUCTOR.recogido?.etiqueta).toMatch(/DESCARGA/);
  });
});
