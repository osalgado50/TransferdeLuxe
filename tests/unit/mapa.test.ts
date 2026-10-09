import { expect, test } from "vitest";
import { estadoEnMapa } from "@/lib/dominio/mapa";

const ahora = new Date("2026-10-15T10:00:00Z");
const pos = (min: number, en_servicio = true) => ({ conductor_id: "c", lat: 0, lng: 0, velocidad: 0, en_servicio, registrado_en: new Date(ahora.getTime() - min * 60_000).toISOString() });

test("estados en el mapa", () => {
  expect(estadoEnMapa(undefined, undefined, ahora, 5)).toBe("sin_senal");
  expect(estadoEnMapa(pos(6), undefined, ahora, 5)).toBe("sin_senal");
  expect(estadoEnMapa(pos(1, false), undefined, ahora, 5)).toBe("sin_senal");
  expect(estadoEnMapa(pos(1), undefined, ahora, 5)).toBe("libre");
  expect(estadoEnMapa(pos(1), { estado: "en_camino" } as never, ahora, 5)).toBe("en_camino");
  expect(estadoEnMapa(pos(1), { estado: "recogido" } as never, ahora, 5)).toBe("con_pasajeros");
});
