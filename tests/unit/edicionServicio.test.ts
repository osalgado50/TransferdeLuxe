import { expect, test } from "vitest";
import { cambiosEdicion, type DatosEdicion } from "@/lib/dominio/edicionServicio";

const base: DatosEdicion = {
  fecha_hora_recogida: "2026-10-20T08:00:00.000Z", origen_texto: "Aeropuerto de Reus (REU)", origen_lat: 41.147, origen_lng: 1.167,
  destino_texto: "Salou · centro", destino_lat: 41.077, destino_lng: 1.141, pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "sedan",
  numero_vuelo: null, cliente_nombre: "Ana", cliente_apellidos: "Prueba", cliente_email: "ana@ejemplo.test", cliente_telefono: "600000001", notas: null,
};

test("sin cambios: nada que guardar ni avisar", () => {
  expect(cambiosEdicion(base, { ...base, fecha_hora_recogida: "2026-10-20T08:00:00Z" })).toEqual({ resumen: [], hora: false, trayecto: false, afectaConductor: false });
});

test("cambio de hora: resumen en hora de Madrid y aviso al conductor", () => {
  const c = cambiosEdicion(base, { ...base, fecha_hora_recogida: "2026-10-20T08:30:00.000Z" });
  expect(c).toMatchObject({ hora: true, trayecto: false, afectaConductor: true });
  expect(c.resumen).toEqual(["Recogida 20/10 10:00 → 20/10 10:30"]);
});

test("cambio de destino o de coordenadas recalcula el trayecto", () => {
  expect(cambiosEdicion(base, { ...base, destino_texto: "Cambrils · puerto", destino_lat: 41.06, destino_lng: 1.06 })).toMatchObject({ trayecto: true, resumen: ["Destino Cambrils · puerto"] });
  expect(cambiosEdicion(base, { ...base, origen_lat: 41.2 }).trayecto).toBe(true);
});

test("pasajeros, vehículo, vuelo, cliente y notas", () => {
  const c = cambiosEdicion(base, { ...base, pasajeros: 5, tipo_vehiculo_pedido: "minivan", numero_vuelo: "FR1234", cliente_telefono: "600000002", notas: "Silla de bebé" });
  expect(c.resumen).toEqual(["2 → 5 pax", "Vehículo MiniVan", "Vuelo FR1234", "Datos del cliente", "Notas"]);
  expect(c.afectaConductor).toBe(true);
  // null y "" son lo mismo (apellidos/notas vacíos).
  expect(cambiosEdicion({ ...base, notas: null }, { ...base, notas: "" }).resumen).toEqual([]);
});

import { construirActividad } from "@/lib/dominio/actividad";
test("actividad: un servicio cerrado por la central no se atribuye al operador como si lo hubiera conducido", () => {
  const s = { id: "s1", estado: "completado", conductor_id: "c1", fecha_hora_recogida: "2026-10-17T18:09:00Z", origen_texto: "Aeropuerto de Reus (REU)",
    destino_texto: "Miami Platja · centro", cliente_nombre: "Irene", origen_pedido: "manual" };
  const r = construirActividad({ servicios: [s], conductores: [{ id: "c1", nombre: "Pepe Demo", telefono: null }],
    eventos: [{ id: 1, servicio_id: "s1", tipo: "completado", actor_id: "op", motivo: "Cerrado por la central", creado_en: "2026-10-17T19:00:00Z" }] } as never);
  expect(r.movimientos[0].texto).toMatch(/^Servicio de las 20:09 .*cerrado por la central \(Pepe Demo no lo cerró\)/);
  expect(r.movimientos[0].conductor).toBe("Pepe Demo");
});
