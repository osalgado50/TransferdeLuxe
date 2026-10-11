import { describe, expect, it, vi } from "vitest";
import { crearAeroDataBox, parsearAeroDataBox } from "@/lib/vuelos/aerodatabox";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const vuelo = { status: "Arrived", arrival: { scheduledTime: { utc: "2026-10-12 10:00Z" }, revisedTime: { utc: "2026-10-12 10:20Z" }, runwayTime: { utc: "2026-10-12 10:25Z" } } };

describe("parsearAeroDataBox", () => {
  it("prefiere la hora de pista", () => {
    const r = parsearAeroDataBox([vuelo]);
    expect(r?.real?.toISOString()).toBe("2026-10-12T10:25:00.000Z");
    expect(r?.programada?.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(r?.estado).toBe("Arrived");
  });
  it("tolera basura", () => {
    expect(parsearAeroDataBox(null)).toBeNull();
    expect(parsearAeroDataBox({ x: 1 })).toBeNull();
    expect(parsearAeroDataBox([{ arrival: { scheduledTime: { utc: "no" } } }, 3])).toBeNull();
  });
});

describe("crearAeroDataBox", () => {
  it("envía la clave en cabecera y parsea", async () => {
    const f = vi.fn(async () => ok([vuelo]));
    const r = await crearAeroDataBox("k", f as unknown as typeof fetch).consultarLlegada("FR1234", "2026-10-12");
    expect(r?.real).not.toBeNull();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/flights/number/FR1234/2026-10-12");
    expect((init.headers as Record<string, string>)["X-RapidAPI-Key"]).toBe("k");
  });
  it("devuelve null en error HTTP, excepción o entrada inválida", async () => {
    expect(await crearAeroDataBox("k", (async () => ok({}, 500)) as unknown as typeof fetch).consultarLlegada("FR1234", "2026-10-12")).toBeNull();
    expect(await crearAeroDataBox("k", (async () => { throw new Error("timeout"); }) as unknown as typeof fetch).consultarLlegada("FR1234", "2026-10-12")).toBeNull();
    const f = vi.fn();
    expect(await crearAeroDataBox("k", f as unknown as typeof fetch).consultarLlegada("../x", "2026-10-12")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
