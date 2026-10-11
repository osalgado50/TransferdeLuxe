import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({
  usuario: null as null | { id: string },
  perfil: null as null | { id: string; rol: string; conduce?: boolean },
  servicio: null as null | Record<string, unknown>,
  tokens: [] as { token: string }[],
  borrados: [] as string[][],
  upserts: [] as unknown[],
}));
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    auth: { getUser: async (t: string) => (t === "bueno" && st.usuario ? { data: { user: st.usuario }, error: null } : { data: { user: null }, error: new Error("jwt") }) },
    from: (tabla: string) => {
      if (tabla === "perfiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.perfil }) }) }) };
      if (tabla === "servicios") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.servicio }) }) }) };
      return {
        select: () => ({ eq: async () => ({ data: st.tokens }) }),
        delete: () => ({
          in: async (_c: string, v: string[]) => { st.borrados.push(v); return { error: null }; },
          eq: (c1: string, v1: string) => ({ eq: async (c2: string, v2: string) => { st.borrados.push([`${c1}=${v1}`, `${c2}=${v2}`]); return { error: null }; } }),
        }),
        upsert: async (f: unknown) => { st.upserts.push(f); return { error: null }; },
      };
    },
  }),
}));
const ej = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/servicios/acciones", () => ({ ejecutarAccion: ej.fn, repoSupabase: vi.fn() }));

import { POST as accion } from "@/app/api/conductor/accion/route";
import { DELETE as borrarPushToken, POST as pushToken } from "@/app/api/conductor/push-token/route";
import { notificarServicioNuevo } from "@/lib/push";

const U = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, auth = "Bearer bueno") =>
  new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) });

beforeEach(() => {
  st.usuario = { id: U }; st.perfil = { id: U, rol: "conductor" }; st.tokens = []; st.borrados = []; st.upserts = [];
  ej.fn.mockReset(); vi.unstubAllGlobals();
});

test("sin Bearer o token inválido → 401", async () => {
  expect((await accion(req({}, ""))).status).toBe(401);
  expect((await accion(req({}, "Bearer malo"))).status).toBe(401);
});
test("no conductor → 403", async () => {
  st.perfil = { id: U, rol: "operador" };
  expect((await accion(req({}))).status).toBe(403);
});
test("operador que también conduce → pasa y actúa con su rol", async () => {
  st.perfil = { id: U, rol: "operador", conduce: true };
  ej.fn.mockResolvedValueOnce({ ok: true, estado: "aceptado" });
  const r = await accion(req({ idAccion: S, servicioId: S, accion: "aceptar" }));
  expect(r.status).toBe(200);
  expect(ej.fn.mock.calls[0][1].actor).toEqual({ id: U, rol: "operador", conduce: true });
});
test("cuerpo inválido → 400", async () => {
  expect((await accion(req({ idAccion: "x", servicioId: S, accion: "volar" }))).status).toBe(400);
  expect(ej.fn).not.toHaveBeenCalled();
});
test("acción correcta y duplicada", async () => {
  ej.fn.mockResolvedValueOnce({ ok: true, estado: "aceptado" }).mockResolvedValueOnce({ ok: true, estado: "aceptado", duplicada: true });
  const b = { idAccion: S, servicioId: S, accion: "aceptar" };
  const r1 = await accion(req(b));
  expect(r1.status).toBe(200);
  expect(ej.fn.mock.calls[0][1]).toMatchObject({ ...b, actor: { id: U, rol: "conductor" } });
  expect(await (await accion(req(b))).json()).toMatchObject({ duplicada: true });
});
test("push-token valida y hace upsert", async () => {
  expect((await pushToken(req({ token: "basura", plataforma: "ios" }))).status).toBe(400);
  expect((await pushToken(req({ token: "ExponentPushToken[abc]", plataforma: "ios" }))).status).toBe(200);
  expect(st.upserts[0]).toMatchObject({ token: "ExponentPushToken[abc]", conductor_id: U, plataforma: "ios" });
});
test("push-token: la central (operador sin conducir) también registra su móvil", async () => {
  st.perfil = { id: U, rol: "operador", conduce: false };
  expect((await pushToken(req({ token: "ExponentPushToken[op]", plataforma: "android" }))).status).toBe(200);
  st.perfil = { id: U, rol: "cliente" };
  expect((await pushToken(req({ token: "ExponentPushToken[x]", plataforma: "android" }))).status).toBe(403);
});
test("DELETE push-token borra solo el token del conductor que llama", async () => {
  const del = (body: unknown, auth = "Bearer bueno") =>
    new Request("http://x/api", { method: "DELETE", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) });
  expect((await borrarPushToken(del({ token: "ExponentPushToken[abc]" }, ""))).status).toBe(401);
  expect((await borrarPushToken(del({ token: "basura" }))).status).toBe(400);
  expect(st.borrados).toEqual([]);
  expect((await borrarPushToken(del({ token: "ExponentPushToken[abc]" }))).status).toBe(200);
  expect(st.borrados).toEqual([["token=ExponentPushToken[abc]", `conductor_id=${U}`]]);
});
test("push: forma del mensaje y limpieza DeviceNotRegistered", async () => {
  st.servicio = { id: S, conductor_id: U, fecha_hora_recogida: "2026-10-10T08:30:00Z", origen_texto: "Aeropuerto", destino_texto: "Hotel" };
  st.tokens = [{ token: "ExponentPushToken[a]" }, { token: "ExponentPushToken[b]" }];
  const f = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] })));
  vi.stubGlobal("fetch", f);
  await notificarServicioNuevo(S);
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://exp.host/--/api/v2/push/send");
  const msgs = JSON.parse(init.body as string);
  expect(msgs[0]).toMatchObject({ to: "ExponentPushToken[a]", title: "Servicio nuevo", body: "10:30 · Aeropuerto → Hotel",
    data: { servicioId: S, tipo: "servicio_nuevo" }, sound: "default", priority: "high", channelId: "servicios" });
  expect(st.borrados).toEqual([["ExponentPushToken[b]"]]);
});
test("push nunca lanza", async () => {
  st.servicio = { id: S, conductor_id: U, fecha_hora_recogida: "2026-10-10T08:30:00Z", origen_texto: "A", destino_texto: "B" };
  st.tokens = [{ token: "ExponentPushToken[a]" }];
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red"); }));
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(notificarServicioNuevo(S)).resolves.toBeUndefined();
  expect(err).toHaveBeenCalled();
});
