import { describe, expect, it } from "vitest";
import { debeEnviar, debeReiniciar, estadoEnvio } from "@/lib/dominio/gps";

describe("debeEnviar", () => {
  it("respeta el intervalo de 15 s", () => {
    expect(debeEnviar(100_000, 90_000, null)).toBe(false);
    expect(debeEnviar(105_000, 90_000, null)).toBe(true);
  });
  it("no envía mientras hay un envío en vuelo reciente", () => {
    expect(debeEnviar(200_000, 0, 195_000)).toBe(false);
  });
  it("un envío colgado más de 10 s ya no bloquea", () => {
    expect(debeEnviar(200_000, 0, 189_000)).toBe(true);
  });
});

describe("debeReiniciar", () => {
  it("reinicia sin fix durante 30 s", () => {
    expect(debeReiniciar(100_000, 69_000, 0)).toBe(true);
    expect(debeReiniciar(100_000, 80_000, 0)).toBe(false);
  });
  it("sin ningún fix cuenta desde el arranque", () => {
    expect(debeReiniciar(100_000, null, 80_000)).toBe(false);
    expect(debeReiniciar(100_000, null, 60_000)).toBe(true);
  });
});

describe("estadoEnvio", () => {
  it("alerta en rojo pasado un minuto", () => {
    expect(estadoEnvio(100_000, null).alerta).toBe(false);
    expect(estadoEnvio(100_000, 50_000)).toEqual({ texto: "📍 última posición enviada hace 50s", alerta: false });
    expect(estadoEnvio(100_000, 30_000).alerta).toBe(true);
  });
});
