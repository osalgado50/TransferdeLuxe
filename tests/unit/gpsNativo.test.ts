import { describe, expect, it } from "vitest";
import {
  alEncender, alIniciar, clasificarRefresco, decidirLote, filtrarCola, sigueActivo, trozos, COLA_GPS_MAX, debeEnviarNativo, decisionSesion, encolarPosicion, filaPosicion, velocidadValida,
  type PosicionPendiente,
} from "@/lib/dominio/gpsNativo";

const pos = (ts: number, dueno = "c1"): PosicionPendiente => ({ dueno, lat: 39.5, lng: 2.6, velocidad: 10, precision_m: 5, ts });

describe("gpsNativo", () => {
  it("throttle de 12 s", () => {
    expect(debeEnviarNativo(1000, null)).toBe(true);
    expect(debeEnviarNativo(12_999, 1000)).toBe(false);
    expect(debeEnviarNativo(13_000, 1000)).toBe(true);
  });
  it("cola con tope: descarta las más antiguas", () => {
    let c: PosicionPendiente[] = [];
    for (let i = 0; i < COLA_GPS_MAX + 5; i++) c = encolarPosicion(c, pos(i));
    expect(c).toHaveLength(COLA_GPS_MAX);
    expect(c[0].ts).toBe(5);
    expect(c.at(-1)!.ts).toBe(COLA_GPS_MAX + 4);
    expect(encolarPosicion([pos(1)], pos(2), 1)).toEqual([pos(2)]);
  });
  it("decisión de sesión", () => {
    const ahora = 1_000_000_000;
    expect(decisionSesion(false, undefined, ahora)).toBe("sin_sesion");
    expect(decisionSesion(true, undefined, ahora)).toBe("ok");
    expect(decisionSesion(true, ahora / 1000 + 30, ahora)).toBe("refrescar");
    expect(decisionSesion(true, ahora / 1000 - 10, ahora)).toBe("refrescar");
    expect(decisionSesion(true, ahora / 1000 + 600, ahora)).toBe("ok");
  });
  it("velocidad y fila", () => {
    expect(velocidadValida(-1)).toBeNull();
    expect(velocidadValida(null)).toBeNull();
    expect(velocidadValida(3.2)).toBe(3.2);
    expect(filaPosicion("c1", pos(5000), 1000).registrado_en).toBe(new Date(1000).toISOString());
    expect(filaPosicion("c1", pos(500), 1000)).toMatchObject({ conductor_id: "c1", lat: 39.5, registrado_en: new Date(500).toISOString() });
  });
  it("encender según permisos", () => {
    expect(alEncender("denied", "denied").estado).toBe("fuera");
    expect(alEncender("denied", "denied").error).toBeTruthy();
    expect(alEncender("granted", "denied")).toEqual({ estado: "solo_primer_plano" });
    expect(alEncender("granted", "granted")).toEqual({ estado: "en_servicio" });
  });
  it("al iniciar la app", () => {
    expect(alIniciar(false, false, "granted", "granted")).toEqual({ accion: "nada", estado: "fuera" });
    expect(alIniciar(false, true, "granted", "granted")).toEqual({ accion: "parar", estado: "fuera" });
    expect(alIniciar(true, false, "granted", "granted")).toEqual({ accion: "arrancar", estado: "en_servicio" });
    expect(alIniciar(true, true, "granted", "denied")).toEqual({ accion: "nada", estado: "solo_primer_plano" });
    expect(alIniciar(true, true, "denied", "denied")).toEqual({ accion: "parar", estado: "fuera" });
  });
  it("refresco: error de red conserva la sesión; refresh token rechazado la pierde", () => {
    expect(clasificarRefresco(true, null)).toBe("ok");
    expect(clasificarRefresco(false, null)).toBe("sin_sesion");
    expect(clasificarRefresco(false, { name: "AuthRetryableFetchError", status: 0 })).toBe("reintentar");
    expect(clasificarRefresco(false, { name: "AuthApiError", status: 500 })).toBe("reintentar");
    expect(clasificarRefresco(false, { name: "AuthApiError", status: 400 })).toBe("sin_sesion");
    expect(clasificarRefresco(false, { name: "AuthApiError", status: 401 })).toBe("sin_sesion");
  });
  it("lote: OFF durante el envío se descarta; sin sesión se para", () => {
    expect(sigueActivo("g1", "g1")).toBe(true);
    expect(sigueActivo("g1", null)).toBe(false); // apagado en vuelo
    expect(sigueActivo("g1", "g2")).toBe(false); // apagado y vuelto a encender
    expect(sigueActivo(null, null)).toBe(false);
    expect(decidirLote(sigueActivo("g1", null), "ok")).toBe("descartar");
    expect(decidirLote(true, "ok")).toBe("enviar");
    expect(decidirLote(true, "reintentar")).toBe("encolar");
    expect(decidirLote(false, "reintentar")).toBe("descartar");
    expect(decidirLote(true, "sin_sesion")).toBe("parar_y_limpiar");
  });
  it("cola por dueño y trozos de 50", () => {
    expect(filtrarCola([pos(1, "c1"), pos(2, "c2"), pos(3, "c1")], "c1").map((p) => p.ts)).toEqual([1, 3]);
    const t = trozos(Array.from({ length: 120 }, (_, i) => i));
    expect(t.map((x) => x.length)).toEqual([50, 50, 20]);
    expect(trozos([])).toEqual([]);
  });
});
