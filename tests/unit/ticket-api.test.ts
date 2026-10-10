import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const U = "11111111-1111-4111-8111-111111111111";
const OTRO = "33333333-3333-4333-8333-333333333333";
const V = "44444444-4444-4444-8444-444444444444";
const st = vi.hoisted(() => ({
  perfil: null as null | Record<string, unknown>,
  inserts: [] as Record<string, unknown>[],
  kms: [] as unknown[],
  subidas: [] as string[],
}));
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    auth: { getUser: async (t: string) => (t === "bueno" ? { data: { user: { id: U } }, error: null } : { data: { user: null }, error: new Error("jwt") }) },
    storage: { from: () => ({ upload: async (p: string) => { st.subidas.push(p); return { error: null }; } }) },
    from: (tabla: string) => {
      if (tabla === "perfiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.perfil }) }) }) };
      if (tabla === "tickets_combustible") return { insert: async (f: Record<string, unknown>) => { st.inserts.push(f); return { error: null }; } };
      return { update: (f: unknown) => ({ eq: () => ({ lt: async (_c: string, v: unknown) => { st.kms.push([f, v]); return { error: null }; } }) }) };
    },
  }),
}));

import { POST as ticket } from "@/app/api/conductor/ticket/route";
import { POST as foto } from "@/app/api/conductor/ticket/foto/route";

const body = { fecha: "2026-10-10", litros: "40,5", importe: "60", km: 1200, gasolinera: "Repsol" };
const req = (b: unknown, auth = "Bearer bueno") =>
  new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(b) });
const reqFoto = (tipo = "image/jpeg", size = 10, auth = "Bearer bueno") => {
  const fd = new FormData(); fd.append("foto", new File([new Uint8Array(size)], "t.jpg", { type: tipo }));
  return new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: fd });
};

beforeEach(() => {
  st.perfil = { id: U, rol: "conductor", vehiculo_habitual_id: V }; st.inserts = []; st.kms = []; st.subidas = [];
});

test("ticket: 401 sin token, 403 no conductor, 400 datos inválidos", async () => {
  expect((await ticket(req(body, ""))).status).toBe(401);
  st.perfil = { id: U, rol: "operador" };
  expect((await ticket(req(body))).status).toBe(403);
  st.perfil = { id: U, rol: "conductor", vehiculo_habitual_id: V };
  expect((await ticket(req({ ...body, litros: "" }))).status).toBe(400);
  expect((await ticket(req([1]))).status).toBe(400);
  expect(st.inserts).toHaveLength(0);
});
test("ticket: foto de otro conductor rechazada", async () => {
  const r = await ticket(req({ ...body, foto_path: `${OTRO}/${crypto.randomUUID()}.jpeg` }));
  expect(r.status).toBe(400);
  expect(st.inserts).toHaveLength(0);
});
test("ticket: sin vehículo habitual → 400", async () => {
  st.perfil = { id: U, rol: "conductor", vehiculo_habitual_id: null };
  expect((await ticket(req(body))).status).toBe(400);
});
test("ticket ok: inserta con vehículo del perfil, corregido y actualiza km", async () => {
  const ia = { fecha: "2026-10-09", gasolinera: "Repsol", litros: 40.5, precio_litro: null, importe: 60, tipo_combustible: null, confianza: "alta" };
  const r = await ticket(req({ ...body, foto_path: `${U}/${crypto.randomUUID()}.jpeg`, datos_ia: ia }));
  expect(r.status).toBe(200);
  expect(st.inserts[0]).toMatchObject({ conductor_id: U, vehiculo_id: V, litros: 40.5, importe: 60, km: 1200, corregido: true });
  expect(st.kms[0]).toEqual([{ km_actuales: 1200 }, 1200]);
});
test("foto: 401, formato, tamaño y ok con ruta del conductor", async () => {
  expect((await foto(reqFoto("image/jpeg", 10, ""))).status).toBe(401);
  expect((await foto(reqFoto("image/gif"))).status).toBe(400);
  expect((await foto(reqFoto("image/jpeg", 5 * 1024 * 1024 + 1))).status).toBe(400);
  const r = await foto(reqFoto("image/png"));
  expect(r.status).toBe(200);
  const j = (await r.json()) as { fotoPath: string };
  expect(j.fotoPath).toMatch(new RegExp(`^${U}/[0-9a-f-]{36}\\.png$`));
  expect(st.subidas).toEqual([j.fotoPath]);
});
