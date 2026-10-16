import { expect, test } from "vitest";
import { accionDevolver, devolviblesEnBloque, MOTIVOS_DEVOLUCION, transicion } from "@/lib/dominio/estados";

test("la ✕ de cada servicio: asignado se rechaza, aceptado o de camino se devuelve; con el cliente a bordo, no", () => {
  expect(accionDevolver("asignado")).toBe("rechazar");
  expect(accionDevolver("aceptado")).toBe("devolver");
  expect(accionDevolver("en_camino")).toBe("devolver");
  for (const e of ["recogido", "completado", "cancelado", "pendiente", "subcontratado"]) expect(accionDevolver(e)).toBeNull();
  // Y el servidor lo acepta: la transición existe para el conductor asignado.
  for (const e of ["asignado", "aceptado", "en_camino"] as const) {
    expect(transicion(e, accionDevolver(e)!, { rol: "conductor", esAsignado: true }).ok).toBe(true);
  }
});

test("devolver todos: solo los que se pueden devolver, sin repetir entre listas", () => {
  const a = { id: "a", estado: "asignado" }, b = { id: "b", estado: "aceptado" }, c = { id: "c", estado: "recogido" }, d = { id: "d", estado: "completado" };
  expect(devolviblesEnBloque([[a, c], [b, a], [d]]).map((x) => x.id)).toEqual(["a", "b"]);
  expect(devolviblesEnBloque([[c, d]])).toEqual([]);
});

test("motivos: incluye los de cuando se acumulan trabajos o la app se queda enganchada, y «Otro» al final", () => {
  expect(MOTIVOS_DEVOLUCION).toContain("Demasiados servicios");
  expect(MOTIVOS_DEVOLUCION).toContain("La app se ha quedado bloqueada");
  expect(MOTIVOS_DEVOLUCION.at(-1)).toBe("Otro");
});
