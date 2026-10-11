import { afterEach, describe, expect, it, vi } from "vitest";
import { clasificarRespuesta, crearFreno, esperaBackoff, segundosRetryAfter } from "@/lib/dominio/reintento";
import { ColaAcciones } from "@/lib/offline/cola";
import { crearEnviarAccion, ErrorTransitorio } from "@/lib/offline/accionApi";

afterEach(() => { vi.useRealTimers(); });

describe("esperaBackoff", () => {
  const sinAzar = { azar: () => 1 };
  it("dobla en cada fallo (2 s, 4 s, 8 s…) y respeta el tope", () => {
    expect([1, 2, 3, 4].map((n) => esperaBackoff(n, sinAzar))).toEqual([2000, 4000, 8000, 16000]);
    expect(esperaBackoff(50, sinAzar)).toBe(300_000);
    expect(esperaBackoff(10, { baseMs: 1000, topeMs: 60_000, azar: () => 1 })).toBe(60_000);
  });
  it("jitter entre la mitad y el total: nunca 0 (nunca en caliente)", () => {
    expect(esperaBackoff(1, { azar: () => 0 })).toBe(1000);
    for (let i = 0; i < 50; i++) {
      const e = esperaBackoff(3);
      expect(e).toBeGreaterThanOrEqual(4000); expect(e).toBeLessThanOrEqual(8000);
    }
  });
  it("valores raros (0, negativos, decimales) se tratan como el primer fallo", () => {
    expect(esperaBackoff(0, sinAzar)).toBe(2000);
    expect(esperaBackoff(-3, sinAzar)).toBe(2000);
    expect(esperaBackoff(2.9, sinAzar)).toBe(4000);
  });
});

describe("segundosRetryAfter", () => {
  it("número, fecha HTTP, ausente o basura", () => {
    expect(segundosRetryAfter("30")).toBe(30);
    expect(segundosRetryAfter("999999")).toBe(3600);
    const ahora = Date.parse("2026-10-11T10:00:00Z");
    expect(segundosRetryAfter("Sun, 11 Oct 2026 10:00:20 GMT", ahora)).toBe(20);
    expect(segundosRetryAfter("Sun, 11 Oct 2026 09:00:00 GMT", ahora)).toBe(0);
    expect(segundosRetryAfter(null)).toBeNull();
    expect(segundosRetryAfter("pronto")).toBeNull();
  });
});

describe("clasificarRespuesta", () => {
  it("red, 5xx, 429 y HTML de la CDN (403 «Checking your browser») = caído", () => {
    expect(clasificarRespuesta(0, null)).toBe("caido");
    expect(clasificarRespuesta(502, "text/html")).toBe("caido");
    expect(clasificarRespuesta(503, "application/json")).toBe("caido");
    expect(clasificarRespuesta(429, "application/json")).toBe("caido");
    expect(clasificarRespuesta(403, "text/html; charset=UTF-8")).toBe("caido");
    expect(clasificarRespuesta(200, "text/html")).toBe("caido");
  });
  it("respuestas JSON del servidor (aunque sean 4xx de negocio) = ok", () => {
    expect(clasificarRespuesta(200, "application/json")).toBe("ok");
    expect(clasificarRespuesta(401, "application/json")).toBe("ok");
    expect(clasificarRespuesta(403, "application/json")).toBe("ok");
    expect(clasificarRespuesta(409, "application/json")).toBe("ok");
    expect(clasificarRespuesta(204, null)).toBe("ok");
  });
});

describe("crearFreno", () => {
  it("como mucho una ejecución por ventana; lo pedido dentro se agrupa en UNA al final", () => {
    vi.useFakeTimers();
    const f = vi.fn();
    const freno = crearFreno(10_000);
    freno.pedir(f);
    expect(f).toHaveBeenCalledTimes(1); // la primera, inmediata
    for (let i = 0; i < 20; i++) freno.pedir(f); // ráfaga (p. ej. socket que parpadea)
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9_999);
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(f).toHaveBeenCalledTimes(2); // una sola para toda la ráfaga
    vi.advanceTimersByTime(60_000);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("cancelar descarta lo pendiente", () => {
    vi.useFakeTimers();
    const f = vi.fn();
    const freno = crearFreno(1000);
    freno.pedir(f); freno.pedir(f); freno.cancelar();
    vi.advanceTimersByTime(5000);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("ColaAcciones con backoff", () => {
  const memoria = () => { let v: string | null = null; return { get: () => v, set: (x: string) => { v = x; } }; };

  it("tras un fallo no reintenta en caliente: espera el backoff (que crece) salvo si se fuerza", async () => {
    let t = 1_000_000;
    const enviar = vi.fn(async () => { throw new Error("HTML 403 de la CDN"); });
    const c = new ColaAcciones(memoria(), enviar, undefined, { ahora: () => t, espera: (n) => 1000 * 2 ** (n - 1) });
    c.encolar({ idAccion: "1", servicioId: "s", accion: "salir" });
    expect(await c.vaciar()).toEqual({ enviadas: 0, errores: [], esperaMs: 1000 });
    // 100 vueltas del temporizador dentro de la ventana: ni una petición más
    for (let i = 0; i < 100; i++) expect((await c.vaciar()).omitida).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
    t += 1000;
    expect((await c.vaciar()).esperaMs).toBe(2000); // segundo fallo: el doble
    t += 1999;
    expect((await c.vaciar()).omitida).toBe(true);
    t += 1;
    await c.vaciar();
    expect(enviar).toHaveBeenCalledTimes(3);
    expect(c.pendientes()[0]).toMatchObject({ intentos: 3, proximoIntento: t + 4000 });
    await c.vaciar(true); // gesto del usuario
    expect(enviar).toHaveBeenCalledTimes(4);
  });

  it("respeta el Retry-After del servidor si es mayor que el backoff", async () => {
    const t = 0;
    const c = new ColaAcciones(memoria(), async () => { throw new ErrorTransitorio("HTTP 429", 120_000); }, undefined, { ahora: () => t, espera: () => 2000 });
    c.encolar({ idAccion: "1", servicioId: "s", accion: "salir" });
    expect((await c.vaciar()).esperaMs).toBe(120_000);
  });

  it("el cliente HTTP convierte 503/429 con Retry-After en ErrorTransitorio con la espera pedida", async () => {
    const res = new Response(JSON.stringify({ error: "x" }), { status: 503, headers: { "Retry-After": "10" } });
    const enviar = crearEnviarAccion({ apiUrl: "https://x.test", token: async () => "t", refrescar: async () => "t", fetch: (async () => res) as unknown as typeof fetch });
    const e = await enviar({ idAccion: "a", servicioId: "s", accion: "salir" }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorTransitorio);
    expect(e.reintentarEnMs).toBe(10_000);
  });

  it("el éxito tras el backoff vacía la cola y no deja rastro", async () => {
    let t = 0, red = false;
    const c = new ColaAcciones(memoria(), async () => { if (!red) throw new Error("x"); return { ok: true }; }, undefined, { ahora: () => t, espera: () => 500 });
    c.encolar({ idAccion: "1", servicioId: "s", accion: "salir" });
    await c.vaciar();
    red = true; t = 500;
    expect(await c.vaciar()).toEqual({ enviadas: 1, errores: [] });
    expect(c.pendientes()).toEqual([]);
  });
});
