import { expect, test } from "vitest";
import { posicionSimulada, RUTAS_DEMO } from "@/lib/demo/rutas";
const ruta = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
test("ida y vuelta por la ruta", () => {
  expect(posicionSimulada(ruta, 0, 1000)).toEqual({ lat: 0, lng: 0 });
  expect(posicionSimulada(ruta, 2000, 1000)).toEqual({ lat: 2, lng: 2 });
  expect(posicionSimulada(ruta, 3000, 1000)).toEqual({ lat: 1, lng: 1 });
  expect(posicionSimulada(ruta, 4000, 1000)).toEqual({ lat: 0, lng: 0 });
});
test("rutas demo con al menos 20 puntos", () => {
  expect(Object.keys(RUTAS_DEMO)).toHaveLength(3);
  for (const r of Object.values(RUTAS_DEMO)) expect(r.length).toBeGreaterThanOrEqual(20);
});
