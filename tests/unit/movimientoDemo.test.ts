import { expect, test } from "vitest";
import { aparcamiento, LUGARES_DEMO } from "@/lib/demo/datosDemo";
import { ACEPTA_TRAS_MS, aparcadoEn, longitudKm, posicionDemo, puntoEnRuta, rutaEntre, salidaHacia, siguientePasoDemo, tramoDemo, type ServicioEnMapa } from "@/lib/demo/movimiento";
import { distanciaKm } from "@/lib/dominio/geo";

const L = LUGARES_DEMO;
const MIN = 60_000;
const t0 = Date.parse("2026-10-22T08:00:00Z");
const serv = (x: Partial<ServicioEnMapa>): ServicioEnMapa => ({
  id: "s", estado: "aceptado", conductor_id: "c", duracion_estimada_min: 35, fecha_hora_recogida: new Date(t0 + 60 * MIN).toISOString(),
  asignado_en: new Date(t0 - 60 * MIN).toISOString(), origen_lat: L.ave.lat, origen_lng: L.ave.lng, destino_lat: L.pa.lat, destino_lng: L.pa.lng, ...x,
});

test("rutas: por carretera entre lugares de la demo (en los dos sentidos) y en línea recta si no es un par conocido", () => {
  const ida = rutaEntre(L.ave, L.pa), vuelta = rutaEntre(L.pa, L.ave);
  expect(ida.length).toBeGreaterThan(10);
  expect(longitudKm(ida)).toBeGreaterThan(distanciaKm(L.ave, L.pa)); // la carretera es más larga que la recta
  expect(distanciaKm(ida[0], L.ave)).toBeLessThan(0.05);
  expect(distanciaKm(ida.at(-1)!, L.pa)).toBeLessThan(0.05);
  expect(distanciaKm(vuelta[0], L.pa)).toBeLessThan(0.05);
  const fuera = { lat: 41.5, lng: 1.5 };
  expect(rutaEntre(fuera, L.pa)).toEqual([fuera, L.pa]);
  // El punto a mitad de camino está sobre la ruta (entre sus extremos, nunca NaN).
  const m = puntoEnRuta(ida, 0.5);
  expect(Number.isFinite(m.lat) && Number.isFinite(m.lng)).toBe(true);
  expect(puntoEnRuta(ida, 0)).toEqual(ida[0]);
  expect(distanciaKm(puntoEnRuta(ida, 1), ida.at(-1)!)).toBeLessThan(0.001);
});

test("el conductor de demo acepta a los 4 min, sale 20 min antes de la recogida y no hace nada sin conductor", () => {
  const asignado = serv({ estado: "asignado", asignado_en: new Date(t0).toISOString() });
  expect(siguientePasoDemo(asignado, null, false, t0 + ACEPTA_TRAS_MS - 1000)).toBeNull();
  expect(siguientePasoDemo(asignado, null, false, t0 + ACEPTA_TRAS_MS)).toEqual({ tipo: "accion", accion: "aceptar" });
  const aceptado = serv({});
  expect(siguientePasoDemo(aceptado, null, false, t0 + 39 * MIN)).toBeNull();
  expect(siguientePasoDemo(aceptado, null, false, t0 + 40 * MIN)).toEqual({ tipo: "accion", accion: "salir" });
  expect(siguientePasoDemo(serv({ conductor_id: null }), null, false, t0 + 50 * MIN)).toBeNull();
  expect(siguientePasoDemo(serv({ estado: "completado" }), null, false, t0 + 500 * MIN)).toBeNull();
});

test("de camino: avanza por la carretera, avisa de que llega 4 min antes y recoge al llegar; luego lleva al cliente", () => {
  const s = serv({ estado: "en_camino" });
  const salida = aparcamiento(3); // Tarragona, a 11 km: llega a su hora
  const tr = tramoDemo(s, salida, t0 + 40 * MIN)!; // salió 20 min antes de la recogida
  expect(tr.fin).toBe(t0 + 60 * MIN);
  const a = posicionDemo(tr, salida, t0 + 41 * MIN), b = posicionDemo(tr, salida, t0 + 50 * MIN);
  expect(a).not.toEqual(b);
  expect(a.velocidad).toBeGreaterThan(20);
  expect(siguientePasoDemo(s, tr, false, t0 + 50 * MIN)).toBeNull();
  expect(siguientePasoDemo(s, tr, false, t0 + 56 * MIN)).toEqual({ tipo: "aviso", evento: "llegando_recogida" });
  expect(siguientePasoDemo(s, tr, true, t0 + 57 * MIN)).toBeNull(); // ya avisó
  expect(siguientePasoDemo(s, tr, true, t0 + 60 * MIN)).toEqual({ tipo: "accion", accion: "cargar" });
  // Al llegar se para en la recogida.
  const llegada = posicionDemo(tr, salida, t0 + 61 * MIN);
  expect(llegada.velocidad).toBe(0);
  expect(distanciaKm(llegada, L.ave)).toBeLessThan(0.05);
  // Con pasajeros: del origen al destino en la duración estimada, y termina al llegar.
  const r = serv({ estado: "recogido" });
  const tr2 = tramoDemo(r, salida, t0 + 60 * MIN)!;
  expect(tr2.fin).toBe(t0 + 95 * MIN);
  expect(siguientePasoDemo(r, tr2, true, t0 + 95 * MIN)).toEqual({ tipo: "accion", accion: "descargar" });
});

test("aparcado: donde dejó al último cliente o en su aparcamiento; de camino nunca sale de la misma recogida", () => {
  const hecho = serv({ id: "h", estado: "completado", fecha_hora_recogida: new Date(t0 - 120 * MIN).toISOString() });
  expect(aparcadoEn([], 1)).toEqual(aparcamiento(1));
  expect(aparcadoEn([hecho], 1)).toEqual({ lat: L.pa.lat, lng: L.pa.lng });
  expect(posicionDemo(null, aparcamiento(2), t0)).toEqual({ ...aparcamiento(2), velocidad: 0 });
  // Tras dejar a un cliente lejos (aeropuerto de Barcelona) vuelve a su base.
  const lejos = serv({ id: "l", estado: "completado", fecha_hora_recogida: new Date(t0 - 60 * MIN).toISOString(), destino_lat: L.bcn.lat, destino_lng: L.bcn.lng });
  expect(aparcadoEn([hecho, lejos], 1)).toEqual(aparcamiento(1));
  // Sin tiempo para llegar a 60 km/h: llega más tarde de la hora de recogida.
  const tarde = tramoDemo(serv({ estado: "en_camino", origen_lat: L.miami.lat, origen_lng: L.miami.lng }), { lat: L.ave.lat, lng: L.ave.lng }, t0 + 55 * MIN)!;
  expect(tarde.fin).toBeGreaterThan(t0 + 60 * MIN);
  expect(posicionDemo(tarde, aparcamiento(0), t0 + 70 * MIN).velocidad).toBeLessThanOrEqual(61);
  // Aparcado en Cambrils y la recogida es en Cambrils: sale del aparcamiento siguiente (si no, no habría tramo).
  const enCambrils = serv({ estado: "en_camino", origen_lat: L.cambrils.lat, origen_lng: L.cambrils.lng });
  const salida = salidaHacia(enCambrils, [enCambrils], 1);
  expect(distanciaKm(salida, L.cambrils)).toBeGreaterThan(3);
});
