import { describe, expect, it } from "vitest";
import { camposSonidoPush, sonidoDeAviso } from "@/lib/dominio/sonidoPush";

describe("sonidoPush", () => {
  it("grave → alarma; servicio nuevo → arpegio; aceptado → ding; retrasos y rechazos → aviso", () => {
    expect(sonidoDeAviso({ tipo: "incidencia", grave: true })).toBe("alarma");
    expect(sonidoDeAviso({ tipo: "servicio_nuevo" })).toBe("servicio_nuevo");
    expect(sonidoDeAviso({ tipo: "reserva_nueva" })).toBe("servicio_nuevo");
    expect(sonidoDeAviso({ tipo: "aceptado" })).toBe("aceptado");
    expect(sonidoDeAviso({ tipo: "rechazado" })).toBe("aviso");
    expect(sonidoDeAviso({ tipo: "retraso_recogida" })).toBe("aviso");
    expect(sonidoDeAviso({ tipo: "otro" })).toBeNull();
  });
  it("campos del push: fichero .wav y canal con el mismo nombre; si no, los de siempre", () => {
    expect(camposSonidoPush({ tipo: "incidencia", grave: true })).toEqual({ sound: "alarma.wav", channelId: "alarma" });
    expect(camposSonidoPush(undefined)).toEqual({ sound: "default", channelId: "servicios" });
  });
});
