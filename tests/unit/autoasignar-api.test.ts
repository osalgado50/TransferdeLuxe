import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (f: () => unknown) => { void f(); } }));

// BD en memoria con un constructor de consultas encadenable (select/eq/in/gte/lt/or/order/limit/maybeSingle).
type Fila = Record<string, unknown>;
const bd = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]>, usuario: null as null | { id: string } }));
function consulta(tabla: string) {
  let filas: Fila[] = [...(bd.tablas[tabla] ?? [])];
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { filas = filas.filter((f) => f[k] === v); return q; },
    in: (k: string, vs: unknown[]) => { filas = filas.filter((f) => vs.includes(f[k])); return q; },
    gte: (k: string, v: string) => { filas = filas.filter((f) => String(f[k]) >= v); return q; },
    lt: (k: string, v: string) => { filas = filas.filter((f) => String(f[k]) < v); return q; },
    or: (expr: string) => { if (expr.includes("conduce")) filas = filas.filter((f) => f.rol === "conductor" || f.conduce === true); return q; },
    order: () => q, limit: () => q,
    maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
    then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: filas, error: null }).then(ok),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    auth: { getUser: async (t: string) => (t === "bueno" && bd.usuario ? { data: { user: bd.usuario }, error: null } : { data: { user: null }, error: new Error("jwt") }) },
    from: (t: string) => consulta(t),
  }),
}));
const op = vi.hoisted(() => ({ ejecutar: vi.fn() }));
vi.mock("@/lib/central/operaciones", () => ({ ejecutarAccionOperador: op.ejecutar }));

import { POST as propuesta, GET as datos } from "@/app/api/central/autoasignar/propuesta/route";
import { POST as confirmar } from "@/app/api/central/autoasignar/confirmar/route";
import { calcularPropuesta, confirmarPropuesta, idAccionLote } from "@/lib/central/autoasignar";
import { auditarPropuesta } from "@/lib/dominio/autoasignacion";
import { vaciarCacheBearer } from "@/lib/supabase/bearer";

const OP = "11111111-1111-4111-8111-111111111111";
const C1 = "c1111111-1111-4111-8111-111111111111", C2 = "c2222222-2222-4222-8222-222222222222", C3 = "c3333333-3333-4333-8333-333333333333";
const V1 = "a1111111-1111-4111-8111-111111111111", V2 = "a2222222-2222-4222-8222-222222222222", V3 = "a3333333-3333-4333-8333-333333333333";
const S = (n: number) => `5${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`;
const LOTE = "77777777-7777-4777-8777-777777777777";
const DIA = "2030-03-12";
const hora = (hh: string) => new Date(`${DIA}T${hh}:00+01:00`).toISOString();
const salou = { lat: 41.0763, lng: 1.1416 }, reus = { lat: 41.1474, lng: 1.1672 }, cambrils = { lat: 41.067, lng: 1.0597 };
const serv = (n: number, hh: string, o = salou, d = reus, extra: Fila = {}) => ({
  id: S(n), estado: "pendiente", conductor_id: null, fecha_hora_recogida: hora(hh), duracion_estimada_min: 30, es_prueba: false,
  origen_lat: o.lat, origen_lng: o.lng, destino_lat: d.lat, destino_lng: d.lng, origen_texto: "Salou", destino_texto: "Aeropuerto de Reus",
  pasajeros: 2, maletas: 2, ...extra,
});
const post = (body: unknown, auth = "Bearer bueno") => new Request("http://x/api", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) });

beforeEach(() => {
  vaciarCacheBearer();
  bd.usuario = { id: OP };
  bd.tablas = {
    ajustes: [{ id: 1, umbral_sin_senal_min: 5, margen_minimo_min: 15 }],
    perfiles: [
      { id: C1, nombre: "Ana", rol: "conductor", vehiculo_habitual_id: V1 },
      { id: C2, nombre: "Luis", rol: "conductor", vehiculo_habitual_id: V2 },
      { id: C3, nombre: "Taller", rol: "conductor", vehiculo_habitual_id: V3 },
      { id: OP, nombre: "Central", rol: "operador", conduce: false, vehiculo_habitual_id: null },
    ],
    vehiculos: [
      { id: V1, matricula: "1111AAA", plazas: 7, maletas: 7, estado: "activo" },
      { id: V2, matricula: "2222BBB", plazas: 3, maletas: 3, estado: "activo" },
      { id: V3, matricula: "3333CCC", plazas: 8, maletas: 8, estado: "taller" },
    ],
    posicion_actual: [],
    servicios: [serv(1, "09:00"), serv(2, "09:00", cambrils, salou), serv(3, "11:00"), serv(4, "11:10", salou, salou, { pasajeros: 6 }),
      serv(5, "12:00", salou, salou, { pasajeros: 20 }), serv(6, "13:00", salou, salou, { es_prueba: true })],
  };
  op.ejecutar.mockReset();
  op.ejecutar.mockImplementation(async (_: string, p: { servicioId: string; conductorId: string }) => {
    const s = bd.tablas.servicios.find((x) => x.id === p.servicioId)!;
    if (s.estado !== "pendiente") return { r: { ok: false, error: "transición no válida" }, avisar: async () => {} };
    Object.assign(s, { estado: "asignado", conductor_id: p.conductorId });
    return { r: { ok: true, estado: "asignado" }, avisar: async () => {} };
  });
});

describe("rutas", () => {
  test("401 sin token, 403 si no es la central", async () => {
    expect((await propuesta(post({}, ""))).status).toBe(401);
    vaciarCacheBearer(); bd.tablas.perfiles.find((p) => p.id === OP)!.rol = "conductor";
    expect((await propuesta(post({}))).status).toBe(403);
    expect((await confirmar(post({ lote: LOTE, lineas: [{ servicioId: S(1), conductorId: C1 }] }))).status).toBe(403);
    expect(op.ejecutar).not.toHaveBeenCalled();
  });
  test("400 con datos no válidos", async () => {
    expect((await propuesta(post({ estrategia: "rapido" }))).status).toBe(400);
    expect((await propuesta(post({ servicioIds: ["x"] }))).status).toBe(400);
    expect((await confirmar(post({ lote: "x", lineas: [] }))).status).toBe(400);
    expect((await confirmar(post({ lote: LOTE, lineas: [] }))).status).toBe(400);
    expect((await datos(new Request("http://x/api?dia=ayer", { headers: { authorization: "Bearer bueno" } }))).status).toBe(400);
  });
  test("GET: datos del diálogo (pendientes del día y conductores marcados sin taller)", async () => {
    const r = await datos(new Request(`http://x/api?dia=${DIA}`, { headers: { authorization: "Bearer bueno" } }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.pendientes.map((p: { id: string }) => p.id)).toEqual([S(1), S(2), S(3), S(4), S(5)]); // sin la de prueba
    expect(j.conductores.map((c: { nombre: string; marcado: boolean }) => [c.nombre, c.marcado])).toEqual([["Ana", true], ["Luis", true], ["Taller", false]]);
    expect(j.margenMinimo).toBe(15);
    expect(j.pendientes[0].duracionTexto).toMatch(/descarga 15 en aeropuerto/);
  });
  test("POST propuesta: no asigna nada y devuelve líneas y entrada", async () => {
    const r = await propuesta(post({ dia: DIA, estrategia: "equitativo" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.propuesta.lineas).toHaveLength(5);
    expect(j.entrada.margenMinimoMin).toBe(15);
    expect(op.ejecutar).not.toHaveBeenCalled();
  });
  test("POST confirmar: asigna y cuenta", async () => {
    const r = await confirmar(post({ lote: LOTE, lineas: [{ servicioId: S(1), conductorId: C1 }, { servicioId: S(2), conductorId: C2 }] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ asignados: 2, saltados: 0, errores: 0 });
  });
});

describe("lógica de servidor", () => {
  test("propuesta del día: sin solapes, grupo de 6 al de 7 plazas, 20 pax a subcontratar, nadie del taller", async () => {
    const { propuesta: p, entrada, servicios } = await calcularPropuesta({ dia: DIA, estrategia: "equitativo" }, new Date(`${DIA}T06:00:00+01:00`));
    expect(auditarPropuesta(entrada, p)).toEqual([]);
    const de = (n: number) => p.lineas.find((l) => l.servicioId === S(n))!;
    expect(de(4).conductorId).toBe(C1);
    expect(de(5)).toMatchObject({ conductorId: null, subcontratar: true });
    expect(p.lineas.some((l) => l.conductorId === C3)).toBe(false);
    expect(new Set([de(1).conductorId, de(2).conductorId])).toEqual(new Set([C1, C2]));
    expect(servicios[S(1)].trayecto).toBe("Salou → Aeropuerto de Reus");
  });
  test("solo los servicios elegidos y los conductores elegidos", async () => {
    const { propuesta: p } = await calcularPropuesta({ servicioIds: [S(3)], conductorIds: [C2], estrategia: "menos_km" }, new Date(`${DIA}T06:00:00+01:00`));
    expect(p.lineas).toEqual([expect.objectContaining({ servicioId: S(3), conductorId: C2 })]);
  });
  test("compromisos fijos: un asignado de Ana a las 11:00 la deja fuera de esa hora", async () => {
    bd.tablas.servicios.push(serv(9, "10:50", salou, salou, { estado: "aceptado", conductor_id: C1 }));
    const { propuesta: p } = await calcularPropuesta({ servicioIds: [S(3)], estrategia: "equitativo" }, new Date(`${DIA}T06:00:00+01:00`));
    expect(p.lineas[0].conductorId).toBe(C2);
  });
  test("confirmar salta lo que cambió de estado y lo que ya no encaja; forzar lo asigna igual", async () => {
    bd.tablas.servicios.find((s) => s.id === S(2))!.estado = "cancelado";
    const { r } = await confirmarPropuesta(OP, { lote: LOTE, lineas: [
      { servicioId: S(1), conductorId: C1 }, { servicioId: S(2), conductorId: C2 },
      { servicioId: S(3), conductorId: C1 }, { servicioId: S(4), conductorId: C1 }, // 11:00 y 11:10 con Ana → la segunda no encaja
    ] }, new Date(`${DIA}T06:00:00+01:00`));
    const res = Object.fromEntries(r.lineas.map((l) => [l.servicioId, l]));
    expect(res[S(1)].resultado).toBe("asignado");
    expect(res[S(2)]).toMatchObject({ resultado: "saltado" });
    expect(res[S(2)].motivo).toMatch(/Ya no está pendiente \(cancelado\)/);
    expect(res[S(3)].resultado).toBe("saltado"); // las dos se solapan: ambas fuera salvo forzar
    expect(res[S(4)].resultado).toBe("saltado");
    expect(r).toMatchObject({ asignados: 1, saltados: 3, errores: 0 });
    const f = await confirmarPropuesta(OP, { lote: LOTE, lineas: [{ servicioId: S(4), conductorId: C2, forzar: true }] }, new Date(`${DIA}T06:00:00+01:00`));
    expect(f.r.lineas[0].resultado).toBe("asignado"); // 6 pax en 3 plazas: solo con «forzar»
  });
  test("vehículo habitual en la asignación e idAccion determinista por lote", async () => {
    await confirmarPropuesta(OP, { lote: LOTE, lineas: [{ servicioId: S(1), conductorId: C1 }] }, new Date(`${DIA}T06:00:00+01:00`));
    expect(op.ejecutar).toHaveBeenCalledWith(OP, expect.objectContaining({ accion: "asignar", servicioId: S(1), conductorId: C1, vehiculoId: V1, idAccion: idAccionLote(LOTE, S(1)) }));
  });
  test("reintento del mismo lote: lo ya asignado cuenta como «ya asignado»", async () => {
    const lineas = [{ servicioId: S(1), conductorId: C1 }];
    await confirmarPropuesta(OP, { lote: LOTE, lineas }, new Date(`${DIA}T06:00:00+01:00`));
    const { r } = await confirmarPropuesta(OP, { lote: LOTE, lineas }, new Date(`${DIA}T06:00:00+01:00`));
    expect(r).toMatchObject({ asignados: 1, saltados: 0 });
    expect(r.lineas[0].resultado).toBe("ya_asignado");
    expect(op.ejecutar).toHaveBeenCalledTimes(1);
  });
  test("un error al asignar no corta el lote", async () => {
    op.ejecutar.mockRejectedValueOnce(new Error("caído"));
    const { r } = await confirmarPropuesta(OP, { lote: LOTE, lineas: [{ servicioId: S(1), conductorId: C1 }, { servicioId: S(2), conductorId: C2 }] }, new Date(`${DIA}T06:00:00+01:00`));
    expect(r).toMatchObject({ asignados: 1, errores: 1 });
  });
  test("idAccionLote: UUID válido, estable y distinto por servicio", () => {
    const a = idAccionLote(LOTE, S(1));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idAccionLote(LOTE, S(1))).toBe(a);
    expect(idAccionLote(LOTE, S(2))).not.toBe(a);
  });
});
