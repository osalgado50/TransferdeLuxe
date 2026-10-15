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
  vehiculo: { matricula: "1234 TDL", km_actuales: 1000 } as Record<string, unknown> | null,
  previos: [] as { km: number; fecha: string }[],
  duplicados: [] as { fecha: string; importe: number; km: number }[],
}));
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    auth: { getUser: async (t: string) => (t === "bueno" ? { data: { user: { id: U } }, error: null } : { data: { user: null }, error: new Error("jwt") }) },
    storage: { from: () => ({ upload: async (p: string) => { st.subidas.push(p); return { error: null }; } }) },
    from: (tabla: string) => {
      if (tabla === "perfiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.perfil }) }) }) };
      if (tabla === "tickets_combustible") return {
        insert: async (f: Record<string, unknown>) => { st.inserts.push(f); return { error: null }; },
        // Consulta encadenada: con filtro de importe es la búsqueda de duplicados; si no, la de km mínimo (atrasados).
        select: () => {
          const filtros: Record<string, unknown> = {};
          const q = {
            eq: (c: string, v: unknown) => { filtros[c] = v; return q; }, lte: () => q, order: () => q,
            limit: async () => ({ data: "importe" in filtros ? st.duplicados.filter((x) => x.fecha === filtros.fecha && x.importe === filtros.importe && x.km === filtros.km) : st.previos }),
          };
          return q;
        },
      };
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.vehiculo }) }) }),
        update: (f: unknown) => ({ eq: () => ({ lt: async (_c: string, v: unknown) => { st.kms.push([f, v]); return { error: null }; } }) }) };
    },
  }),
}));

import { hoyMadrid } from "@/lib/dominio/ticketReglas";
import { sumarDias } from "@/lib/dominio/dias";
import { POST as ticket } from "@/app/api/conductor/ticket/route";
import { POST as foto } from "@/app/api/conductor/ticket/foto/route";
import { vaciarCacheBearer } from "@/lib/supabase/bearer"; // la verificación del token se cachea 60 s
import { purgarCaducados } from "@/lib/limite";

// Fechas relativas a hoy (Madrid): el ticket no puede tener más de 60 días.
const hoy = () => hoyMadrid();
const haceDias = (n: number) => sumarDias(hoy(), -n);
const body = { fecha: haceDias(5), litros: "40,5", importe: "60", km: 1200, gasolinera: "Repsol" };
const req = (b: unknown, auth = "Bearer bueno") =>
  new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(b) });
const FIRMAS: Record<string, number[]> = { "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff] };
const reqFoto = async (tipo = "image/jpeg", size = 10, auth = "Bearer bueno", firma = FIRMAS[tipo] ?? []) => {
  const bytes = new Uint8Array(size); bytes.set(firma.slice(0, size));
  const fd = new FormData(); fd.append("foto", new File([bytes], "t.jpg", { type: tipo }));
  const cuerpo = new Response(fd);
  const body = await cuerpo.arrayBuffer();
  const headers: Record<string, string> = { "content-type": cuerpo.headers.get("content-type")!, "content-length": String(body.byteLength) };
  if (auth) headers.authorization = auth;
  return new Request("http://x/api", { method: "POST", headers, body });
};

beforeEach(() => {
  purgarCaducados(Date.now() + 3_600_000); // límite de 10 tickets/min: cada prueba empieza de cero
  vaciarCacheBearer(); st.perfil = { id: U, rol: "conductor", vehiculo_habitual_id: V }; st.inserts = []; st.kms = []; st.subidas = [];
  st.vehiculo = { matricula: "1234 TDL", km_actuales: 1000 }; st.previos = []; st.duplicados = [];
});

test("ticket: 401 sin token, 403 no conductor, 400 datos inválidos", async () => {
  expect((await ticket(req(body, ""))).status).toBe(401);
  purgarCaducados(Date.now() + 3_600_000); // límite de 10 tickets/min: cada prueba empieza de cero
  vaciarCacheBearer(); st.perfil = { id: U, rol: "operador" };
  expect((await ticket(req(body))).status).toBe(403);
  purgarCaducados(Date.now() + 3_600_000); // límite de 10 tickets/min: cada prueba empieza de cero
  vaciarCacheBearer(); st.perfil = { id: U, rol: "conductor", vehiculo_habitual_id: V };
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
  purgarCaducados(Date.now() + 3_600_000); // límite de 10 tickets/min: cada prueba empieza de cero
  vaciarCacheBearer(); st.perfil = { id: U, rol: "conductor", vehiculo_habitual_id: null };
  expect((await ticket(req(body))).status).toBe(400);
});
test("ticket ok: inserta con vehículo del perfil, corregido y actualiza km", async () => {
  const ia = { fecha: haceDias(6), gasolinera: "Repsol", litros: 40.5, precio_litro: null, importe: 60, tipo_combustible: null, confianza: "alta" };
  const r = await ticket(req({ ...body, fecha: hoy(), foto_path: `${U}/${crypto.randomUUID()}.jpeg`, datos_ia: ia }));
  expect(r.status).toBe(200);
  expect(st.inserts[0]).toMatchObject({ conductor_id: U, vehiculo_id: V, litros: 40.5, importe: 60, km: 1200, corregido: true });
  expect(st.kms[0]).toEqual([{ km_actuales: 1200 }, 1200]);
});
test("foto: 401, formato, tamaño y ok con ruta del conductor", async () => {
  expect((await foto(await reqFoto("image/jpeg", 10, ""))).status).toBe(401);
  expect((await foto(await reqFoto("image/gif"))).status).toBe(400);
  // El tipo declarado no basta: manda la firma real.
  expect((await foto(await reqFoto("image/png", 10, "Bearer bueno", []))).status).toBe(400);
  expect((await foto(await reqFoto("image/jpeg", 5 * 1024 * 1024 + 1))).status).toBe(400);
  expect((await foto(new Request("http://x/api", { method: "POST", headers: { authorization: "Bearer bueno" } }))).status).toBe(411);
  const r = await foto(await reqFoto("image/png"));
  expect(r.status).toBe(200);
  const j = (await r.json()) as { fotoPath: string };
  expect(j.fotoPath).toMatch(new RegExp(`^${U}/[0-9a-f-]{36}\\.png$`));
  expect(st.subidas).toEqual([j.fotoPath]);
});

test("km: un ticket de hoy no puede tener menos km que los últimos del vehículo", async () => {
  const r = await ticket(req({ ...body, fecha: hoy(), km: 900 }));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toMatch(/no pueden ser menos que los últimos registrados de 1234 TDL: 1\.000 km/);
  expect(st.inserts).toHaveLength(0);
  expect((await ticket(req({ ...body, fecha: hoy(), km: 1000 }))).status).toBe(200);
});
test("km: un ticket atrasado se compara con el ticket más alto de ese día o anterior", async () => {
  st.vehiculo = { matricula: "1234 TDL", km_actuales: 5000 }; // hoy ya va por 5.000: no cuenta para un ticket del día 10
  st.previos = [{ km: 1300, fecha: "2026-10-08" }];
  const r = await ticket(req({ ...body, km: 1200 }));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toMatch(/ticket del 08\/10\/2026: 1\.300 km/);
  expect((await ticket(req({ ...body, km: 1350 }))).status).toBe(200);
});
test("foto .jpg (como la guarda la subida) se acepta al guardar", async () => {
  expect((await ticket(req({ ...body, foto_path: `${U}/${crypto.randomUUID()}.jpg` }))).status).toBe(200);
});
test("datos de factura: se guardan los que llegan (vacíos → null) y se rechaza una hora rara", async () => {
  const r = await ticket(req({ ...body, hora: "16:55", nif_gasolinera: "b93275394", numero_factura: "039R2400065003", base_imponible: "16,53", iva_pct: 21, iva_importe: "" }));
  expect(r.status).toBe(200);
  expect(st.inserts[0]).toMatchObject({ hora: "16:55", nif_gasolinera: "B93275394", numero_factura: "039R2400065003", base_imponible: 16.53, iva_pct: 21, iva_importe: null });
  expect((await ticket(req({ ...body, hora: "25:99" }))).status).toBe(400);
});

test("fecha: ni futura ni de hace más de 60 días, con mensaje claro", async () => {
  let r = await ticket(req({ ...body, fecha: "2024-04-25" }));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toMatch(/últimos 60 días/);
  r = await ticket(req({ ...body, fecha: sumarDias(hoy(), 1) }));
  expect((await r.json()).error).toMatch(/no puede ser futura/);
  expect((await ticket(req({ ...body, fecha: haceDias(60) }))).status).toBe(200);
  expect(st.inserts).toHaveLength(1);
});
test("km del vehículo: solo los sube un ticket reciente (hoy o 2 días antes), nunca uno atrasado", async () => {
  expect((await ticket(req({ ...body, fecha: haceDias(2), km: 1500 }))).status).toBe(200);
  expect(st.kms).toEqual([[{ km_actuales: 1500 }, 1500]]);
  expect((await ticket(req({ ...body, fecha: haceDias(3), km: 9000 }))).status).toBe(200);
  expect(st.kms).toHaveLength(1);
});
test("duplicado: mismo vehículo, fecha, importe y km → rechazado", async () => {
  st.duplicados = [{ fecha: body.fecha, importe: 60, km: 1200 }];
  const r = await ticket(req(body));
  expect(r.status).toBe(400);
  expect((await r.json()).error).toMatch(/^Ya hay un ticket igual/);
  expect(st.inserts).toHaveLength(0);
  expect((await ticket(req({ ...body, km: 1201 }))).status).toBe(200);
});
