import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({
  getUser: 0, perfiles: 0, sondas: 0,
  modo: "ok" as "ok" | "malo" | "caido" | "lento",
  perfil: { id: "u1", rol: "conductor" } as Record<string, unknown> | null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    auth: {
      getUser: async (t: string) => {
        st.getUser++;
        if (st.modo === "lento") await new Promise((r) => setTimeout(r, 20));
        if (st.modo === "caido") return { data: { user: null }, error: Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 }) };
        if (st.modo === "malo" || t === "malo") return { data: { user: null }, error: Object.assign(new Error("invalid JWT"), { status: 403 }) };
        return { data: { user: { id: "u1" } }, error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => { st.perfiles++; return { data: st.perfil, error: null }; } }),
        limit: async () => { st.sondas++; return { error: null }; },
      }),
    }),
  }),
}));

import { CacheTtl, expDeJwt } from "@/lib/cacheTtl";
import { comprobarLimite } from "@/lib/limite";
import { LIMITE_IP_MIN, LIMITE_TOKEN_MIN, exigirConductorBearer, tamanoCacheBearer, vaciarCacheBearer, verificarBearer } from "@/lib/supabase/bearer";
import { estadoBd, reiniciarSalud } from "@/lib/salud";
import { GET as salud } from "@/app/api/salud/route";
import { arrancarVigilante } from "@/lib/vigilante";

const jwt = (exp: number, extra = "") => `h.${Buffer.from(JSON.stringify({ exp, sub: `u1${extra}` })).toString("base64url")}.firma`;
let ipN = 0;
const req = (token: string | null, ip = `10.0.0.${++ipN % 250}`) =>
  new Request("http://x/api/conductor/accion", { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-real-ip": ip } });

beforeEach(() => {
  vaciarCacheBearer(); reiniciarSalud();
  st.getUser = 0; st.perfiles = 0; st.sondas = 0; st.modo = "ok"; st.perfil = { id: "u1", rol: "conductor" };
});
afterEach(() => { vi.useRealTimers(); });

describe("CacheTtl / expDeJwt", () => {
  it("caduca por entrada y se mantiene acotada", () => {
    let t = 0;
    const c = new CacheTtl<number>(3, () => t);
    c.set("a", 1, 100); c.set("b", 2, 1000); c.set("c", 3, 1000); c.set("d", 4, 1000);
    expect(c.tamano).toBe(3);
    expect(c.get("a")).toBeUndefined(); // la más vieja salió
    t = 1000;
    expect(c.get("b")).toBeUndefined();
    c.set("x", 9, 0); expect(c.get("x")).toBeUndefined(); // TTL 0: no se guarda
  });
  it("lee exp sin verificar y tolera basura", () => {
    expect(expDeJwt(jwt(123))).toBe(123);
    expect(expDeJwt("bueno")).toBeNull();
    expect(expDeJwt("a.@@@.c")).toBeNull();
  });
});

describe("comprobarLimite", () => {
  it("dice cuánto falta (Retry-After) y rechazar no alarga el bloqueo", () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    expect(comprobarLimite("t", 2, 60_000).ok).toBe(true);
    vi.setSystemTime(10_000);
    expect(comprobarLimite("t", 2, 60_000).ok).toBe(true);
    vi.setSystemTime(20_000);
    expect(comprobarLimite("t", 2, 60_000)).toEqual({ ok: false, reintentarEnS: 40 });
    for (let i = 0; i < 100; i++) comprobarLimite("t", 2, 60_000); // cliente desbocado
    vi.setSystemTime(60_000);
    expect(comprobarLimite("t", 2, 60_000).ok).toBe(true); // a los 60 s del primero, hueco
  });
});

describe("verificarBearer: caché y límites", () => {
  const futuro = () => Math.floor(Date.now() / 1000) + 3600;

  it("el bucle de la app (cientos de peticiones con el mismo token) solo pregunta a Supabase una vez", async () => {
    const t = jwt(futuro(), "bucle");
    for (let i = 0; i < 100; i++) expect((await verificarBearer(req(t))).tipo).toBe("ok");
    expect(st.getUser).toBe(1);
    expect(st.perfiles).toBe(1);
  });

  it("peticiones simultáneas con el mismo token comparten UNA verificación en vuelo", async () => {
    st.modo = "lento";
    const t = jwt(futuro(), "sim");
    const r = await Promise.all(Array.from({ length: 30 }, () => verificarBearer(req(t))));
    expect(r.every((x) => x.tipo === "ok")).toBe(true);
    expect(st.getUser).toBe(1);
  });

  it("la caché dura 60 s como mucho y nunca más allá del exp del JWT", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000_000);
    const largo = jwt(1_000_000 + 3600), corto = jwt(1_000_000 + 10);
    await verificarBearer(req(largo)); await verificarBearer(req(corto));
    expect(st.getUser).toBe(2);
    vi.setSystemTime(1_000_000_000 + 11_000);
    expect((await verificarBearer(req(corto))).tipo).toBe("invalido"); // caducado: ni se pregunta
    await verificarBearer(req(largo));
    expect(st.getUser).toBe(2);
    vi.setSystemTime(1_000_000_000 + 61_000);
    await verificarBearer(req(largo));
    expect(st.getUser).toBe(3); // pasados 60 s se vuelve a comprobar (rol o baja recientes)
  });

  it("token rechazado se cachea (no se martillea Supabase); Supabase caído → 503 sin cachear", async () => {
    for (let i = 0; i < 20; i++) expect((await verificarBearer(req("malo"))).tipo).toBe("invalido");
    expect(st.getUser).toBe(1);
    st.modo = "caido";
    const t = jwt(futuro(), "x");
    expect((await verificarBearer(req(t))).tipo).toBe("caido");
    expect((await verificarBearer(req(t))).tipo).toBe("caido");
    expect(st.getUser).toBe(3); // el fallo transitorio no se guarda
    const r = await exigirConductorBearer(req(t));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.res.status).toBe(503); expect(r.res.headers.get("Retry-After")).toBe("10"); }
    st.modo = "ok";
    expect((await verificarBearer(req(t))).tipo).toBe("ok"); // se recupera sola
  });

  it("límite por IP ANTES de autenticar: 429 con Retry-After y sin tocar Supabase", async () => {
    for (let i = 0; i < LIMITE_IP_MIN; i++) await verificarBearer(req(`malo`, "1.2.3.4"));
    const antes = st.getUser;
    const r = await exigirConductorBearer(req(jwt(futuro(), "ip"), "1.2.3.4"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(429);
      expect(Number(r.res.headers.get("Retry-After"))).toBeGreaterThan(0);
    }
    expect(st.getUser).toBe(antes);
    expect((await verificarBearer(req(jwt(futuro(), "ip"), "5.6.7.8"))).tipo).toBe("ok"); // otras IP siguen funcionando
  });

  it("límite por token (un dispositivo desbocado detrás de una IP compartida)", async () => {
    const t = jwt(futuro(), "tok");
    let ultimo;
    for (let i = 0; i <= LIMITE_TOKEN_MIN; i++) ultimo = await verificarBearer(req(t));
    expect(ultimo).toMatchObject({ tipo: "limite" });
  });

  it("la caché está acotada", async () => {
    for (let i = 0; i < 1100; i++) await verificarBearer(req(jwt(futuro(), String(i))));
    expect(tamanoCacheBearer()).toBeLessThanOrEqual(1000);
  });
});

describe("GET /api/salud", () => {
  it("responde sin auth, no-store, y la BD se consulta como mucho una vez cada 30 s", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await salud(req(null));
      expect(r.status).toBe(200);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(await r.json()).toMatchObject({ ok: true, servidor: "ok", bd: "ok" });
    }
    expect(st.sondas).toBe(1);
  });
  it("BD colgada → «caida» en ≤ 3 s, sin colgar la respuesta", async () => {
    vi.useFakeTimers();
    const p = estadoBd(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(3000);
    expect((await p).estado).toBe("caida");
  });
  it("sondas desbocadas desde una IP → 429 con Retry-After", async () => {
    let r: Response | undefined;
    for (let i = 0; i < 121; i++) r = await salud(req(null, "9.9.9.9"));
    expect(r!.status).toBe(429);
    expect(r!.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("vigilante", () => {
  it("nunca se solapa (la siguiente pasada se programa al terminar) y con fallos aplica backoff", async () => {
    vi.useFakeTimers();
    (globalThis as { __vigilantePush?: boolean }).__vigilantePush = false;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    let activas = 0, maxActivas = 0, llamadas = 0, falla = false;
    const pasada = async () => {
      llamadas++; activas++; maxActivas = Math.max(maxActivas, activas);
      await new Promise((r) => setTimeout(r, 50_000)); // más lenta que el periodo (20 s)
      activas--;
      if (falla) throw new Error("Supabase caído");
    };
    arrancarVigilante(20_000, pasada);
    arrancarVigilante(20_000, pasada); // segunda llamada: no arranca otro
    await vi.advanceTimersByTimeAsync(20_000 + 50_000 + 20_000 + 50_000);
    expect(llamadas).toBe(2);
    expect(maxActivas).toBe(1);
    falla = true;
    const antes = llamadas;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    // con 50 s por pasada + backoff (≥ 20 s, creciendo hasta 5 min) caben muchas menos que 10 min / 20 s
    expect(llamadas - antes).toBeLessThanOrEqual(6);
    expect(maxActivas).toBe(1);
    (globalThis as { __vigilantePush?: boolean }).__vigilantePush = false;
  });
});
