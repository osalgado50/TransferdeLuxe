import { describe, expect, it } from "vitest";
import {
  calcularPuntualidad, claveAvisoRetraso, debeAvisarRetraso, formatoMinutos, textoAvisoRetraso, REINTENTO_AVISO_RETRASO_MS,
} from "@/lib/dominio/puntualidad";

const REC = "2026-10-11T17:50:00Z"; // 19:50 en Madrid
const antes = (min: number) => Date.parse(REC) - min * 60_000;
const p = (estado: string, ahora: number, etaS?: number | null) => calcularPuntualidad({ estado, recogida: REC, ahora, etaS });

describe("calcularPuntualidad", () => {
  it("solo antes de recoger (asignado / aceptado / en camino)", () => {
    for (const e of ["pendiente", "recogido", "completado", "cancelado"]) expect(p(e, antes(10)).estado).toBeNull();
    for (const e of ["asignado", "aceptado", "en_camino"]) expect(p(e, antes(30)).estado).toBe("a_tiempo");
  });
  it("a tiempo con ETA: «Faltan 12 min · llegas a tiempo»", () => {
    const r = p("en_camino", antes(12), 5 * 60);
    expect(r).toMatchObject({ estado: "a_tiempo", minutosHastaRecogida: 12, minutosRetraso: 0, porEta: false });
    expect(r.texto).toBe("Faltan 12 min · llegas a tiempo");
  });
  it("justo: menos de 5 min de margen", () => {
    expect(p("en_camino", antes(12), 9 * 60).texto).toBe("Llegas justo · 3 min de margen");
    expect(p("en_camino", antes(12), 9 * 60).estado).toBe("justo");
    // Llega 1 min tarde: dentro de la tolerancia de 2 min, aún «justo».
    expect(p("en_camino", antes(10), 11 * 60)).toMatchObject({ estado: "justo", texto: "Llegas justo · sin margen" });
  });
  it("tarde por ETA (antes de la hora): «Llegas tarde · +8 min» y porEta", () => {
    const r = p("en_camino", antes(10), 18 * 60);
    expect(r).toMatchObject({ estado: "tarde", minutosRetraso: 8, porEta: true, texto: "Llegas tarde · +8 min" });
    expect(r.llegadaEstimada).toBe(Date.parse(REC) + 8 * 60_000);
    // Justo en el límite (+2 min): todavía no es tarde.
    expect(p("en_camino", antes(10), 12 * 60).estado).toBe("justo");
  });
  it("hora superada sin recoger: «Recogida hace 6 min · aún no has llegado» (no es aviso por ETA)", () => {
    const r = p("aceptado", antes(-6));
    expect(r).toMatchObject({ estado: "tarde", minutosHastaRecogida: -6, minutosRetraso: 6, porEta: false });
    expect(r.texto).toBe("Recogida hace 6 min · aún no has llegado");
    expect(p("en_camino", antes(-6), 10 * 60).minutosRetraso).toBe(16);
    expect(p("en_camino", antes(-0.1)).texto).toBe("Recogida hace 1 min · aún no has llegado");
  });
  it("sin ETA: solo el reloj (ámbar con menos de 5 min)", () => {
    expect(p("asignado", antes(130))).toMatchObject({ estado: "a_tiempo", texto: "Faltan 2 h 10 min para la recogida" });
    expect(p("asignado", antes(3)).estado).toBe("justo");
    expect(p("asignado", antes(3), null).texto).toBe("Faltan 3 min para la recogida");
  });
  it("ETA no válida se ignora", () => {
    expect(p("en_camino", antes(30), Number.NaN).llegadaEstimada).toBeNull();
    expect(p("en_camino", antes(30), -5).texto).toBe("Faltan 30 min para la recogida");
  });
});

describe("aviso anticipado a la central", () => {
  const tarde = p("en_camino", antes(10), 18 * 60);
  const base = { enviado: false, enCurso: false, ultimoIntento: 0, ahora: 1_000_000 };
  it("solo si va tarde por ETA, una vez y como mucho un intento cada 60 s", () => {
    expect(debeAvisarRetraso(tarde, base)).toBe(true);
    expect(debeAvisarRetraso(tarde, { ...base, enviado: true })).toBe(false);
    expect(debeAvisarRetraso(tarde, { ...base, enCurso: true })).toBe(false);
    expect(debeAvisarRetraso(tarde, { ...base, ultimoIntento: base.ahora - 30_000 })).toBe(false);
    expect(debeAvisarRetraso(tarde, { ...base, ultimoIntento: base.ahora - REINTENTO_AVISO_RETRASO_MS })).toBe(true);
    expect(debeAvisarRetraso(p("en_camino", antes(12), 5 * 60), base)).toBe(false);
    expect(debeAvisarRetraso(p("aceptado", antes(-6)), base)).toBe(false); // pasada la hora: lo avisa el servidor
  });
  it("texto de la incidencia automática y clave por servicio", () => {
    expect(textoAvisoRetraso(tarde)).toBe("Aviso automático: llegada estimada 19:58 (+8 min)");
    expect(claveAvisoRetraso("s1")).toBe("tdl-retraso:s1");
    expect(formatoMinutos(65)).toBe("1 h 05 min");
  });
});
