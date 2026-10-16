import { expect, test } from "vitest";
import { segundosRestantes, siguienteNuevo, claveAsignacion } from "@/lib/dominio/plazo";
test("cuenta atrás", () => {
  const a = "2026-10-15T10:00:00Z";
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:05:00Z"))).toBe(600);
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:20:00Z"))).toBe(0);
});

test("clave de asignación independiente del formato de fecha", () => {
  const a = claveAsignacion({ id: "x", asignado_en: "2026-10-10T08:00:00.120Z" });
  expect(claveAsignacion({ id: "x", asignado_en: "2026-10-10 08:00:00.12+00" })).toBe(a);
  expect(claveAsignacion({ id: "x", asignado_en: null })).toBe("x|");
});

test("«Servicio nuevo»: lo de ahora delante; asignaciones viejas sin responder no lo tapan", () => {
  const ahora = new Date("2026-10-16T10:50:00Z");
  const s = (id: string, recogida: string, asignado: string, x: Partial<{ estado: string; conductor_id: string }> = {}) =>
    ({ id, estado: "asignado", conductor_id: "yo", asignado_en: asignado, fecha_hora_recogida: recogida, ...x });
  const viejo = s("viejo", "2026-10-13T12:08:00Z", "2026-10-13T11:32:00Z"); // del día 13, sin responder
  const mañana = s("manana", "2026-10-17T08:00:00Z", "2026-10-15T09:00:00Z");
  const ahoraMismo = s("ahora", "2026-10-16T10:45:00Z", "2026-10-16T10:44:00Z");
  const lista = [viejo, mañana, ahoraMismo];
  expect(siguienteNuevo(lista, "yo", new Set(), ahora)?.id).toBe("ahora");
  // «Ver más tarde» en el de ahora: sale el siguiente más próximo, nunca el caducado.
  expect(siguienteNuevo(lista, "yo", new Set([claveAsignacion(ahoraMismo)]), ahora)?.id).toBe("manana");
  expect(siguienteNuevo([viejo], "yo", new Set(), ahora)).toBeUndefined();
  // Recogida pasada hace menos de 6 h: aún se ofrece (puede ser un retraso).
  expect(siguienteNuevo([s("tarde", "2026-10-16T06:00:00Z", "2026-10-16T05:00:00Z")], "yo", new Set(), ahora)?.id).toBe("tarde");
  // Solo los míos y asignados.
  expect(siguienteNuevo([s("otro", "2026-10-16T11:00:00Z", "2026-10-16T10:00:00Z", { conductor_id: "x" }), s("ok", "2026-10-16T11:00:00Z", "2026-10-16T10:00:00Z", { estado: "aceptado" })], "yo", new Set(), ahora)).toBeUndefined();
});
