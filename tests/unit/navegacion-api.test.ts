import { beforeEach, expect, test, vi } from "vitest";

const perfil = vi.hoisted(() => ({ actual: null as null | { id: string; rol: string } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/sesion", () => ({
  perfilActual: async () => perfil.actual,
  exigirRol: async (rol: string) => { if (!perfil.actual || perfil.actual.rol !== rol) throw new Error("redirect"); return perfil.actual; },
}));
const bd = vi.hoisted(() => ({ servicio: null as null | { id: string; estado: string; conductor_id: string }, previos: 0, insertados: [] as unknown[] }));
vi.mock("@/lib/supabase/admin", () => ({
  clienteAdmin: () => ({
    from: (tabla: string) => {
      if (tabla === "servicios") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: bd.servicio }) }) }) };
      return {
        select: () => ({ eq: () => ({ eq: async () => ({ count: bd.previos }) }) }),
        insert: async (fila: unknown) => { bd.insertados.push(fila); return { error: null }; },
      };
    },
  }),
}));
vi.mock("@/lib/servicios/acciones", () => ({ ejecutarAccion: vi.fn(), repoSupabase: vi.fn() }));
vi.mock("@/lib/navegacion/ruta", async (orig) => {
  const m = await orig<typeof import("@/lib/navegacion/ruta")>();
  return { ...m, obtenerRuta: vi.fn(async (o, d) => m.rutaRecta(o, d)) };
});

import { GET } from "@/app/api/ruta/route";
import { avisarLlegando } from "@/app/conductor/actions";
import { obtenerRuta } from "@/lib/navegacion/ruta";

const url = (q: string) => new Request(`http://x/api/ruta?${q}`);
beforeEach(() => { perfil.actual = null; bd.servicio = null; bd.previos = 0; bd.insertados = []; vi.mocked(obtenerRuta).mockClear(); });

test("/api/ruta: 401 sin sesión o con rol no válido", async () => {
  expect((await GET(url("o=41.1,1.1&d=41.0,1.2"))).status).toBe(401);
  perfil.actual = { id: "c", rol: "cliente" };
  expect((await GET(url("o=41.1,1.1&d=41.0,1.2"))).status).toBe(401);
});

test("/api/ruta: 400 con coordenadas mal formadas", async () => {
  perfil.actual = { id: "c1", rol: "conductor" };
  expect((await GET(url("o=abc&d=41.0,1.2"))).status).toBe(400);
  expect((await GET(url("o=,1&d=41.0,1.2"))).status).toBe(400);
});

test("/api/ruta: superado el límite por usuario devuelve recta sin llamar a OSRM", async () => {
  perfil.actual = { id: "limitado", rol: "conductor" };
  for (let i = 0; i < 30; i++) await GET(url("o=41.1,1.1&d=41.0,1.2"));
  expect(obtenerRuta).toHaveBeenCalledTimes(30);
  const r = await GET(url("o=41.1,1.1&d=41.0,1.2"));
  expect(r.status).toBe(200);
  expect((await r.json()).fuente).toBe("recta");
  expect(obtenerRuta).toHaveBeenCalledTimes(30);
});

test("avisarLlegando: solo servicio propio y en el estado que toca, una vez", async () => {
  await expect(avisarLlegando("s1", "recogida")).rejects.toThrow(); // sin sesión
  perfil.actual = { id: "c1", rol: "conductor" };
  expect((await avisarLlegando("s1", "recogida")).ok).toBe(false); // no existe
  bd.servicio = { id: "s1", estado: "en_camino", conductor_id: "otro" };
  expect((await avisarLlegando("s1", "recogida")).ok).toBe(false); // ajeno
  bd.servicio = { id: "s1", estado: "en_camino", conductor_id: "c1" };
  expect((await avisarLlegando("s1", "destino")).ok).toBe(false); // estado incoherente
  expect((await avisarLlegando("s1", "recogida")).ok).toBe(true);
  expect(bd.insertados).toEqual([{ servicio_id: "s1", tipo: "llegando_recogida", actor_id: "c1" }]);
  bd.previos = 1;
  expect((await avisarLlegando("s1", "recogida")).ok).toBe(true);
  expect(bd.insertados).toHaveLength(1); // deduplicado
});
