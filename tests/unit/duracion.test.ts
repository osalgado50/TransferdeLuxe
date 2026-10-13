import { describe, expect, test } from "vitest";
import { duracionServicio, duracionEfectiva, textoDuracion, tipoPunto, trayectoMin, CARGA_MIN, DURACION_MINIMA_MIN } from "@/lib/dominio/duracion";
import { aPlan, duracionFila } from "@/lib/dominio/planificacion";

const salou = { lat: 41.0763, lng: 1.1416 };
const cambrils = { lat: 41.067, lng: 1.0597 };
const reusAero = { lat: 41.1474, lng: 1.1672 };
const campTgn = { lat: 41.1906, lng: 1.2725 };
const bcnAero = { lat: 41.2974, lng: 2.0833 };

describe("tipoPunto", () => {
  test("por texto", () => {
    expect(tipoPunto("Aeropuerto de Reus")).toBe("aeropuerto");
    expect(tipoPunto("Aeroport del Prat, Terminal 1")).toBe("aeropuerto");
    expect(tipoPunto("Barcelona Airport T1")).toBe("aeropuerto");
    expect(tipoPunto("Estació Camp de Tarragona")).toBe("estacion");
    expect(tipoPunto("Estación de Sants, Barcelona")).toBe("estacion");
    expect(tipoPunto("Renfe Salou")).toBe("estacion");
    expect(tipoPunto("Hotel Best Negresco, Salou")).toBe("otro");
    expect(tipoPunto("Parking estacionamiento Salou")).toBe("otro");
    expect(tipoPunto(null)).toBe("otro");
  });
  test("por estar junto a un aeropuerto o estación conocidos", () => {
    expect(tipoPunto("Carretera T-315 s/n", reusAero)).toBe("aeropuerto");
    expect(tipoPunto("", { lat: 41.1915, lng: 1.2735 })).toBe("estacion");
    expect(tipoPunto("Plaza Europa", salou)).toBe("otro");
  });
});

describe("duracionServicio", () => {
  test("trayecto por modelo + carga/descarga 5 min (hotel a hotel)", () => {
    const d = duracionServicio({ origen: salou, destino: cambrils, origenTexto: "Hotel A, Salou", destinoTexto: "Hotel B, Cambrils" });
    expect(d.fuente).toBe("modelo");
    expect(d.trayectoMin).toBe(trayectoMin(salou, cambrils));
    expect(d.cargaMin).toBe(5);
    expect(d.descargaMin).toBe(5);
    expect(d.totalMin).toBe(Math.max(DURACION_MINIMA_MIN, d.trayectoMin! + 10));
  });
  test("aeropuerto → hotel: 15 de carga en el aeropuerto", () => {
    const d = duracionServicio({ origen: reusAero, destino: salou, origenTexto: "Aeropuerto de Reus", destinoTexto: "Salou" });
    expect(d.tipoOrigen).toBe("aeropuerto");
    expect(d.cargaMin).toBe(CARGA_MIN.aeropuerto);
    expect(d.descargaMin).toBe(5);
    expect(d.totalMin).toBe(d.trayectoMin! + 20);
  });
  test("estación → aeropuerto: 15 + 15", () => {
    const d = duracionServicio({ origen: campTgn, destino: bcnAero, origenTexto: "Estació Camp de Tarragona", destinoTexto: "Aeropuerto de Barcelona" });
    expect(d.cargaMin + d.descargaMin).toBe(30);
    expect(d.trayectoMin).toBeGreaterThan(60);
  });
  test("ruta en caché manda sobre el modelo", () => {
    const d = duracionServicio({ origen: salou, destino: bcnAero, rutaMin: 84.2, destinoTexto: "Aeropuerto de Barcelona" });
    expect(d.fuente).toBe("ruta");
    expect(d.trayectoMin).toBe(85);
    expect(d.totalMin).toBe(85 + 5 + 15);
  });
  test("mínimo 15 min y sin coordenadas usa la guardada", () => {
    expect(duracionServicio({ origen: salou, destino: salou }).totalMin).toBe(15);
    const g = duracionServicio({ origen: null, destino: salou, guardadaMin: 50 });
    expect(g).toMatchObject({ fuente: "guardada", trayectoMin: null, totalMin: 50 });
    expect(duracionServicio({ origen: null, destino: null }).totalMin).toBe(45);
  });
  test("efectiva: la mayor entre guardada y calculada", () => {
    expect(duracionEfectiva({ origen: salou, destino: cambrils, guardadaMin: 90 })).toBe(90);
    const calc = duracionServicio({ origen: reusAero, destino: salou, origenTexto: "Aeropuerto de Reus" }).totalMin;
    expect(duracionEfectiva({ origen: reusAero, destino: salou, origenTexto: "Aeropuerto de Reus", guardadaMin: 15 })).toBe(calc);
    expect(duracionEfectiva({ origen: null, destino: null, guardadaMin: 33 })).toBe(33);
  });
  test("texto del desglose", () => {
    const d = duracionServicio({ origen: reusAero, destino: salou, origenTexto: "Aeropuerto de Reus", destinoTexto: "Salou" });
    expect(textoDuracion(d)).toMatch(/^≈ \d+ min \(trayecto \d+ \+ carga 15 en aeropuerto \+ descarga 5\)$/);
    expect(textoDuracion(duracionServicio({ origen: null, destino: null, guardadaMin: 75 }))).toBe("≈ 1 h 15 min (sin coordenadas: duración guardada)");
  });
  test("el plan (aPlan) usa la duración efectiva", () => {
    const f = { id: "x", fecha_hora_recogida: "2026-10-20T10:00:00+02:00", duracion_estimada_min: 20, origen_lat: reusAero.lat, origen_lng: reusAero.lng,
      destino_lat: bcnAero.lat, destino_lng: bcnAero.lng, origen_texto: "Aeropuerto de Reus", destino_texto: "Aeropuerto de Barcelona" };
    expect(duracionFila(f)).toBeGreaterThan(100);
    expect(aPlan(f).duracionMin).toBe(duracionFila(f));
  });
});
