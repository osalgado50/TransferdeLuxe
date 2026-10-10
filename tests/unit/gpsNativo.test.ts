import { describe, expect, it } from "vitest";
import {
  alEncender, alIniciar, COLA_GPS_MAX, debeEnviarNativo, decisionSesion, encolarPosicion, filaPosicion, velocidadValida,
  type PosicionPendiente,
} from "@/lib/dominio/gpsNativo";

const pos = (ts: number): PosicionPendiente => ({ lat: 39.5, lng: 2.6, velocidad: 10, precision_m: 5, ts });

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
});
