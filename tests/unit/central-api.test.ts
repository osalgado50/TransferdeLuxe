import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (f: () => unknown) => { void f(); } }));
const st = vi.hoisted(() => ({ usuario: null as null | { id: string }, perfil: null as null | { id: string; rol: string; conduce?: boolean } }));
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    auth: { getUser: async (t: string) => (t === "bueno" && st.usuario ? { data: { user: st.usuario }, error: null } : { data: { user: null }, error: new Error("jwt") }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.perfil }) }) }) }),
  }),
}));
const op = vi.hoisted(() => ({ ejecutar: vi.fn(), vista: vi.fn(), sugerencias: vi.fn(), resumen: vi.fn(), avisar: vi.fn() }));
vi.mock("@/lib/central/operaciones", () => ({
  ejecutarAccionOperador: op.ejecutar, marcarAlertaVista: op.vista, sugerenciasServicio: op.sugerencias, resumenCentral: op.resumen,
}));

import { GET as resumen } from "@/app/api/central/resumen/route";
import { GET as sugerencia } from "@/app/api/central/sugerencia/route";
import { POST as asignar } from "@/app/api/central/asignar/route";
import { POST as reasignar } from "@/app/api/central/reasignar/route";
import { POST as alertaVista } from "@/app/api/central/alerta-vista/route";

const U = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const post = (body: unknown, auth = "Bearer bueno") => new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) });
const get = (q = "", auth = "Bearer bueno") => new Request(`http://x/api${q}`, { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  st.usuario = { id: U }; st.perfil = { id: U, rol: "operador" };
  Object.values(op).forEach((f) => f.mockReset());
});

test("401 sin Bearer o token malo; 403 si es conductor (aunque conduzca)", async () => {
  expect((await resumen(get("", ""))).status).toBe(401);
  expect((await asignar(post({}, "Bearer malo"))).status).toBe(401);
  st.perfil = { id: U, rol: "conductor" };
  for (const r of [await resumen(get()), await sugerencia(get(`?servicio=${S}`)), await asignar(post({})), await reasignar(post({})), await alertaVista(post({}))]) expect(r.status).toBe(403);
  expect(op.ejecutar).not.toHaveBeenCalled();
});
test("resumen ok", async () => {
  op.resumen.mockResolvedValue({ alertas: [], pendientes: [], hoy: [], posiciones: [], conductores: [] });
  const r = await resumen(get());
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ alertas: [] });
});
test("sugerencia: 400 sin id válido, 404 si no existe, 200 con lista", async () => {
  expect((await sugerencia(get("?servicio=x"))).status).toBe(400);
  op.sugerencias.mockResolvedValueOnce(null).mockResolvedValueOnce([{ conductorId: C }]);
  expect((await sugerencia(get(`?servicio=${S}`))).status).toBe(404);
  const r = await sugerencia(get(`?servicio=${S}`));
  expect(await r.json()).toEqual({ sugerencias: [{ conductorId: C }] });
});
test("asignar/reasignar: 400 cuerpo inválido; 200 ok y avisa; 409 rechazo", async () => {
  expect((await asignar(post({ idAccion: S, servicioId: S }))).status).toBe(400);
  op.ejecutar.mockResolvedValueOnce({ r: { ok: true, estado: "asignado" }, avisar: op.avisar }).mockResolvedValueOnce({ r: { ok: false, error: "No" }, avisar: op.avisar });
  const b = { idAccion: S, servicioId: S, conductorId: C };
  expect((await asignar(post(b))).status).toBe(200);
  expect(op.ejecutar).toHaveBeenLastCalledWith(U, { ...b, vehiculoId: undefined, accion: "asignar" });
  expect(op.avisar).toHaveBeenCalled();
  const r = await reasignar(post(b));
  expect(r.status).toBe(409);
  expect(op.ejecutar).toHaveBeenLastCalledWith(U, { ...b, vehiculoId: undefined, accion: "reasignar" });
});
test("alerta-vista: 400 y ok", async () => {
  expect((await alertaVista(post({ servicioId: "x" }))).status).toBe(400);
  const r = await alertaVista(post({ servicioId: S }));
  expect(await r.json()).toEqual({ ok: true });
  expect(op.vista).toHaveBeenCalledWith(S);
});
