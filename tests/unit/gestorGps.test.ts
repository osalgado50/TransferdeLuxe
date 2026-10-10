import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cb = (x: unknown) => void;
let watches: { ok: Cb; err: Cb }[];
let geo: { watchPosition: ReturnType<typeof vi.fn>; clearWatch: ReturnType<typeof vi.fn>; getCurrentPosition: ReturnType<typeof vi.fn> };
const fix = { coords: { latitude: 41, longitude: 2, accuracy: 5, speed: null }, timestamp: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  watches = [];
  geo = {
    watchPosition: vi.fn((ok: Cb, err: Cb) => { watches.push({ ok, err }); return watches.length; }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  const ev = new EventTarget();
  vi.stubGlobal("navigator", { geolocation: geo });
  vi.stubGlobal("document", Object.assign(ev, { visibilityState: "visible" }));
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("gestor de GPS", () => {
  it("un solo watch compartido con ref-counting y repetición del último fix", async () => {
    const { suscribirGps } = await import("@/lib/gps/gestor");
    const a = vi.fn(), b = vi.fn();
    const qa = suscribirGps({ fix: a });
    watches[0].ok(fix);
    const qb = suscribirGps({ fix: b });
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith(fix); // suscriptor tardío
    qa(); expect(geo.clearWatch).not.toHaveBeenCalled();
    qb(); expect(geo.clearWatch).toHaveBeenCalledTimes(1);
  });
  it("el watchdog reinicia tras 30 s sin fix", async () => {
    const { suscribirGps } = await import("@/lib/gps/gestor");
    suscribirGps({ fix: vi.fn() });
    vi.advanceTimersByTime(25_000);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  });
  it("con permiso denegado no reinicia ni por watchdog ni por visibilidad", async () => {
    const { suscribirGps } = await import("@/lib/gps/gestor");
    const err = vi.fn();
    suscribirGps({ fix: vi.fn(), error: err });
    watches[0].err({ code: 1, PERMISSION_DENIED: 1 });
    vi.advanceTimersByTime(120_000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
  });
  it("visibilitychange + pageshow seguidos → un solo reinicio", async () => {
    const { suscribirGps } = await import("@/lib/gps/gestor");
    suscribirGps({ fix: vi.fn() });
    vi.advanceTimersByTime(3_000);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  });
});
