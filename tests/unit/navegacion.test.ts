import { beforeEach, expect, test, vi } from "vitest";
import { objetivoActual, faseProximidad, formatoDistancia, formatoDuracion, restanteEnRuta, llegandoReciente, etiquetaEvento } from "@/lib/dominio/navegacion";
import { obtenerRuta, leerPunto, limpiarCacheRuta } from "@/lib/navegacion/ruta";

const s = { origen_lat: 41.1474, origen_lng: 1.1672, destino_lat: 41.088, destino_lng: 1.158 };

test("objetivoActual según estado", () => {
  expect(objetivoActual("aceptado", s)?.tipo).toBe("recogida");
  expect(objetivoActual("en_camino", s)?.punto).toEqual({ lat: 41.1474, lng: 1.1672 });
  expect(objetivoActual("recogido", s)?.tipo).toBe("destino");
  expect(objetivoActual("completado", s)).toBeNull();
  expect(objetivoActual("asignado", s)).toBeNull();
  expect(objetivoActual("recogido", { ...s, destino_lat: null })).toBeNull();
});

test("faseProximidad con umbrales e histéresis", () => {
  expect(faseProximidad(800)).toBe("lejos");
  expect(faseProximidad(500)).toBe("cerca");
  expect(faseProximidad(100)).toBe("llegado");
  expect(faseProximidad(550, "lejos")).toBe("lejos");
  expect(faseProximidad(550, "cerca")).toBe("cerca");
  expect(faseProximidad(601, "cerca")).toBe("lejos");
  expect(faseProximidad(140, "llegado")).toBe("llegado");
  expect(faseProximidad(160, "llegado")).toBe("cerca");
  expect(faseProximidad(580, "llegado")).toBe("cerca");
  expect(faseProximidad(120, "cerca")).toBe("cerca");
});

test("formatos es-ES", () => {
  expect(formatoDistancia(4200)).toBe("4,2 km");
  expect(formatoDistancia(347)).toBe("350 m");
  expect(formatoDuracion(420)).toBe("7 min");
  expect(formatoDuracion(3900)).toBe("1 h 05 min");
  expect(formatoDuracion(10)).toBe("1 min");
});

test("restanteEnRuta sigue la polilínea desde el punto más cercano", () => {
  // L: norte ~1,11 km y luego este ~0,84 km
  const coords: [number, number][] = [[41, 1], [41.01, 1], [41.01, 1.01]];
  const total = restanteEnRuta(coords, { lat: 41, lng: 1 });
  expect(total.restanteM).toBeGreaterThan(1900);
  expect(total.restanteM).toBeLessThan(2000);
  const mitad = restanteEnRuta(coords, { lat: 41.005, lng: 1 });
  expect(mitad.restanteM).toBeGreaterThan(1340);
  expect(mitad.restanteM).toBeLessThan(1440);
  expect(mitad.desvioM).toBeLessThan(1);
  const fuera = restanteEnRuta(coords, { lat: 41.005, lng: 1.005 });
  expect(fuera.desvioM).toBeGreaterThan(300);
  expect(restanteEnRuta([[41, 1]], { lat: 41.01, lng: 1 }).restanteM).toBeGreaterThan(1100);
});

test("llegandoReciente: último evento real, ventana de 20 min y estado coherente", () => {
  const ahora = new Date("2026-10-10T10:00:00Z");
  // Forma real: la central carga todos los eventos de los últimos 20 min (cualquier tipo) + los rechazos.
  const ev = [
    { id: 1, servicio_id: "a", tipo: "en_camino", creado_en: "2026-10-10T09:45:00Z" },
    { id: 2, servicio_id: "a", tipo: "llegando_recogida", creado_en: "2026-10-10T09:50:00Z" },
    { id: 3, servicio_id: "b", tipo: "llegando_destino", creado_en: "2026-10-10T09:58:00Z" },
  ];
  expect(llegandoReciente(ev, { id: "a", estado: "en_camino" }, ahora)?.id).toBe(2);
  expect(llegandoReciente(ev, { id: "a", estado: "aceptado" }, ahora)?.id).toBe(2);
  expect(llegandoReciente(ev, { id: "a", estado: "recogido" }, ahora)).toBeNull(); // ya cargó: no es vigente
  expect(llegandoReciente(ev, { id: "a", estado: "en_camino" }, new Date("2026-10-10T10:30:00Z"))).toBeNull();
  expect(llegandoReciente([...ev, { id: 4, servicio_id: "a", tipo: "recogido", creado_en: "2026-10-10T09:55:00Z" }], { id: "a", estado: "en_camino" }, ahora)).toBeNull();
  expect(llegandoReciente(ev, { id: "b", estado: "recogido" }, ahora)?.id).toBe(3);
  expect(llegandoReciente(ev, { id: "b", estado: "completado" }, ahora)).toBeNull();
  expect(llegandoReciente(ev, { id: "c", estado: "en_camino" }, ahora)).toBeNull();
  expect(etiquetaEvento("llegando_destino")).toBe("Llegando al destino");
  expect(etiquetaEvento("aceptado")).toBe("aceptado");
});

beforeEach(() => limpiarCacheRuta());
const o = { lat: 41.1474, lng: 1.1672 }, d = { lat: 41.088, lng: 1.158 };

test("obtenerRuta usa OSRM y cachea", async () => {
  const f = vi.fn(async () => new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 9000, duration: 600, geometry: { coordinates: [[1.1672, 41.1474], [1.16, 41.12], [1.158, 41.088]] } }] })));
  const r = await obtenerRuta(o, d, f as unknown as typeof fetch);
  expect(r.fuente).toBe("osrm");
  expect(r.coords[0]).toEqual([41.1474, 1.1672]);
  expect(r.distanciaM).toBe(9000);
  await obtenerRuta({ lat: 41.14741, lng: 1.16722 }, d, f as unknown as typeof fetch);
  expect(f).toHaveBeenCalledTimes(1);
});

test("obtenerRuta cae a línea recta si OSRM falla", async () => {
  vi.useFakeTimers();
  for (const f of [vi.fn(async () => { throw new Error("red"); }), vi.fn(async () => new Response("x", { status: 503 })), vi.fn(async () => new Response(JSON.stringify({ code: "NoRoute" })))]) {
    limpiarCacheRuta();
    const r = await obtenerRuta(o, d, f as unknown as typeof fetch);
    expect(r.fuente).toBe("recta");
    expect(r.coords).toEqual([[o.lat, o.lng], [d.lat, d.lng]]);
    expect(r.distanciaM).toBeGreaterThan(7000);
    expect(r.duracionS).toBeGreaterThan(0);
    vi.advanceTimersByTime(1100);
  }
  vi.useRealTimers();
});

test("obtenerRuta: caché negativa 60 s, 1 petición/s y peticiones idénticas agrupadas", async () => {
  vi.useFakeTimers();
  const falla = vi.fn(async () => { throw new Error("red"); });
  expect((await obtenerRuta(o, d, falla as unknown as typeof fetch)).fuente).toBe("recta");
  vi.advanceTimersByTime(2000);
  await obtenerRuta(o, d, falla as unknown as typeof fetch);
  expect(falla).toHaveBeenCalledTimes(1); // fallo cacheado
  vi.advanceTimersByTime(61_000);
  const ok = vi.fn(async () => new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 9000, duration: 600, geometry: { coordinates: [[1.1672, 41.1474], [1.158, 41.088]] } }] })));
  const [a, b] = await Promise.all([obtenerRuta(o, d, ok as unknown as typeof fetch), obtenerRuta(o, d, ok as unknown as typeof fetch)]);
  expect(a.fuente).toBe("osrm"); expect(b).toBe(a);
  expect(ok).toHaveBeenCalledTimes(1);
  // otra ruta en el mismo segundo: limitada → recta sin llamar a OSRM
  const otra = await obtenerRuta({ lat: 41.2, lng: 1.2 }, d, ok as unknown as typeof fetch);
  expect(otra.fuente).toBe("recta"); expect(ok).toHaveBeenCalledTimes(1);
  // fuera de Cataluña: recta sin llamar
  vi.advanceTimersByTime(1100);
  expect((await obtenerRuta({ lat: 40.4, lng: -3.7 }, d, ok as unknown as typeof fetch)).fuente).toBe("recta");
  expect(ok).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

test("leerPunto valida formato", () => {
  expect(leerPunto("41.1,1.2")).toEqual({ lat: 41.1, lng: 1.2 });
  expect(leerPunto("40.4,-3.7")).toEqual({ lat: 40.4, lng: -3.7 });
  expect(leerPunto(",1.2")).toBeNull();
  expect(leerPunto("41.1,")).toBeNull();
  expect(leerPunto("95,1")).toBeNull();
  expect(leerPunto("abc")).toBeNull();
  expect(leerPunto("41,1,2")).toBeNull();
  expect(leerPunto(null)).toBeNull();
});

import { debePedirRuta, tiempoRestanteS, textoBannerRuta, textoAvisoProximidad, claveAvisoNav } from "@/lib/dominio/navegacion";
test("debePedirRuta: objetivo nuevo, primer fix y desvío limitado a 1 vez / 30 s", () => {
  expect(debePedirRuta(null, "a", false, null, 0)).toBe(true);
  const p = { clave: "a", t: 1000, conPos: true };
  expect(debePedirRuta(p, "b", true, null, 1001)).toBe(true);
  expect(debePedirRuta({ ...p, conPos: false }, "a", true, null, 1001)).toBe(true);
  expect(debePedirRuta(p, "a", true, 100, 999_999)).toBe(false);
  expect(debePedirRuta(p, "a", true, 301, 1000 + 29_999)).toBe(false);
  expect(debePedirRuta(p, "a", true, 301, 1000 + 30_000)).toBe(true);
});
test("tiempo restante, banner y avisos", () => {
  expect(tiempoRestanteS(null, 100)).toBeNull();
  expect(tiempoRestanteS({ distanciaM: 1000, duracionS: 600 }, 500)).toBe(300);
  expect(tiempoRestanteS({ distanciaM: 1000, duracionS: 600 }, 5000)).toBe(600);
  expect(textoBannerRuta("recogida", 4200, 420)).toBe("Hacia la recogida · 4,2 km · 7 min");
  expect(textoBannerRuta("destino", null, null)).toBe("Hacia el destino");
  expect(textoAvisoProximidad("cerca", "recogida", 430)).toBe("Estás llegando a la recogida (≈ 430 m)");
  expect(textoAvisoProximidad("llegado", "destino", 20)).toBe("Has llegado al destino");
  expect(claveAvisoNav("s1", "destino", "cerca")).toBe("tdl-nav:s1:destino:cerca");
});
