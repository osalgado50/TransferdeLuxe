import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import { accionJornada, registrarCierre } from "@/lib/conductor/modulos";
import { tecnicoInicial } from "@/lib/dominio/cierre";

const V = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";

/** Cliente Supabase mínimo: ajustes, vehículo, jornada abierta, último cierre y la RPC cerrar_jornada. */
function sbFalso(o: { modulos?: object; kmActual?: number; abierta?: boolean; rpc?: unknown; ultimo?: { gravedad: string; creado_en: string } | null } = {}) {
  const llamadas: { rpc: unknown[]; updates: string[] } = { rpc: [], updates: [] };
  const consulta = (fila: unknown, tabla = "") => {
    const q: Record<string, unknown> = {};
    q.update = () => { llamadas.updates.push(tabla); return { eq: () => ({ is: async () => ({ error: null }) }) }; };
    for (const k of ["select", "eq", "is", "order", "limit"]) q[k] = () => q;
    q.maybeSingle = async () => ({ data: fila });
    return q;
  };
  const sb = {
    from: (t: string) => {
      if (t === "ajustes") return consulta({ modulos: o.modulos ?? {} });
      if (t === "vehiculos") return consulta({ id: V, km_actuales: o.kmActual ?? 1000 });
      if (t === "jornadas") return consulta(o.abierta === false ? null : { id: "j1", conductor_id: "c", inicio: "2026-10-12T06:00:00Z", fin: null, pausas: [] }, t);
      if (t === "cierres_jornada") return consulta(o.ultimo ?? null);
      return { update: () => { llamadas.updates.push(t); return { eq: () => ({ is: async () => ({ error: null }) }) }; } };
    },
    rpc: async (...a: unknown[]) => { llamadas.rpc.push(a); return { data: o.rpc ?? { id: "x", jornada_id: "j1", duplicada: false }, error: null }; },
  };
  return { sb: sb as unknown as SupabaseClient, llamadas };
}
const base = { idAccion: A, vehiculo_id: V, zonas: ["porton", "capo", "capo"], tecnico: { ...tecnicoInicial(), aceite: "falta" }, combustible: "1_2", km: 1500, comentario: " Golpe en el portón " };

describe("hoja de cierre (servidor)", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("valida, calcula la gravedad y llama a la RPC atómica con zonas normalizadas", async () => {
    const { sb, llamadas } = sbFalso();
    const r = await registrarCierre(sb, "c", base);
    expect(r).toEqual({ ok: true, gravedad: "grave", duplicada: false });
    const [nombre, args] = llamadas.rpc[0] as [string, Record<string, unknown>];
    expect(nombre).toBe("cerrar_jornada");
    expect(args).toMatchObject({ p_conductor: "c", p_vehiculo: V, p_id_accion: A, p_zonas: ["capo", "porton"], p_km: 1500, p_comentario: "Golpe en el portón", p_gravedad: "grave" });
    expect((args.p_tecnico as { testigos: string[] }).testigos).toEqual([]);
  });
  it("rechaza km menores que los actuales, zonas inventadas y comentario largo", async () => {
    expect((await registrarCierre(sbFalso({ kmActual: 2000 }).sb, "c", base)).ok).toBe(false);
    expect((await registrarCierre(sbFalso().sb, "c", { ...base, zonas: ["ala"] })).ok).toBe(false);
    const r = await registrarCierre(sbFalso().sb, "c", { ...base, comentario: "x".repeat(1001) });
    expect(r.ok === false && r.error).toMatch(/1000/);
    const sinV = await registrarCierre(sbFalso().sb, "c", { ...base, vehiculo_id: "" });
    expect(sinV.ok === false && sinV.error).toBe("Elige el vehículo.");
  });
  it("sin jornada abierta: 409, salvo reintento de un cierre recién enviado", async () => {
    const r = await registrarCierre(sbFalso({ rpc: { error: "sin_jornada" } }).sb, "c", base);
    expect(r.ok === false && r.status).toBe(409);
    const r2 = await registrarCierre(sbFalso({ rpc: { error: "sin_jornada" }, ultimo: { gravedad: "ok", creado_en: new Date().toISOString() } }).sb, "c", base);
    expect(r2).toEqual({ ok: true, gravedad: "ok", duplicada: true });
  });
  it("módulo jornada desactivado → 403", async () => {
    const r = await registrarCierre(sbFalso({ modulos: { jornada: false } }).sb, "c", base);
    expect(r.ok === false && r.status).toBe(403);
  });
  it("«Finalizar jornada» sin hoja no se bloquea (apps antiguas); con o sin los módulos, finaliza", async () => {
    expect((await accionJornada(sbFalso().sb, "c", "finalizar")).ok).toBe(true);
    for (const modulos of [{ cierre: false }, { checklist: false }]) {
      const { sb, llamadas } = sbFalso({ modulos });
      expect((await accionJornada(sb, "c", "finalizar")).ok).toBe(true);
      expect(llamadas.updates).toContain("jornadas");
    }
    expect((await accionJornada(sbFalso({ abierta: false }).sb, "c", "finalizar")).ok).toBe(true); // ya finalizada: idempotente
  });
});
