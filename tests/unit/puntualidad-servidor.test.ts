import { expect, test } from "vitest";
import { indicadoresHoy } from "@/lib/central/puntualidad";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente falso: cada tabla devuelve sus filas; registra los filtros aplicados.
function falso(tablas: Record<string, unknown[]>, filtros: string[] = [], fallo = false) {
  return {
    from(t: string) {
      const q = {
        select: () => q, in: () => q, gte: () => q, lt: () => q, limit: () => q,
        eq: (k: string, v: unknown) => { filtros.push(`${t}.${k}=${v}`); return q; },
        maybeSingle: async () => ({ data: (tablas[t] ?? [])[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown) => Promise.resolve(fallo && t === "servicios" ? { data: null, error: { message: "x" } } : { data: tablas[t] ?? [], error: null }).then(ok),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}
const ahora = new Date("2026-10-20T10:00:00+02:00");
const s = { id: "a", estado: "aceptado", conductor_id: "c1", fecha_hora_recogida: "2026-10-20T10:20:00+02:00", duracion_estimada_min: 20,
  origen_lat: 41.0763, origen_lng: 1.1416, destino_lat: 41.0763, destino_lng: 1.1416, origen_texto: "Salou", destino_texto: "Salou" };

test("indicadoresHoy: semáforo con GPS reciente y filtros de prueba/conductor", async () => {
  const filtros: string[] = [];
  const r = await indicadoresHoy(falso({
    servicios: [s], ajustes: [{ umbral_sin_senal_min: 5 }],
    posicion_actual: [{ conductor_id: "c1", lat: 41.2974, lng: 2.0833, en_servicio: true, registrado_en: new Date(ahora.getTime() - 60_000).toISOString() }],
  }, filtros), ahora, "c1");
  expect(r.a).toMatchObject({ estado: "tarde", conGps: true });
  expect(filtros).toEqual(expect.arrayContaining(["servicios.es_prueba=false", "servicios.conductor_id=c1", "posicion_actual.conductor_id=c1"]));
});
test("indicadoresHoy: si la consulta falla, vacío (no tumba la página ni el resumen)", async () => {
  expect(await indicadoresHoy(falso({}, [], true), ahora)).toEqual({});
});
