"use server";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { RUTAS_DEMO, posicionSimulada } from "@/lib/demo/rutas";

async function exigirDemo() {
  if (process.env.NEXT_PUBLIC_MODO_DEMO !== "true") throw new Error("Modo demo desactivado");
  await exigirRol("operador");
}

const GPS_REAL_MS = 5 * 60_000;

/**
 * Inserta una posición por conductor demo siguiendo su ruta, salvo a los que tienen GPS real reciente
 * (las posiciones reales llevan precisión; las simuladas no), para no mezclar el coche simulado con el real.
 */
export async function simularPaso(): Promise<void> {
  await exigirDemo();
  const sb = clienteAdmin();
  const ahora = Date.now(), ts = new Date(ahora).toISOString();
  const [conductores, reales] = await Promise.all([
    sb.from("perfiles").select("id,nombre").eq("rol", "conductor"),
    sb.from("posiciones").select("conductor_id").not("precision_m", "is", null).gte("registrado_en", new Date(ahora - GPS_REAL_MS).toISOString()),
  ]);
  if (conductores.error) throw new Error(conductores.error.message);
  if (reales.error) throw new Error(reales.error.message);
  const conGpsReal = new Set((reales.data ?? []).map((r) => r.conductor_id));
  const filas = (conductores.data ?? [])
    .filter((c) => RUTAS_DEMO[c.nombre] && !conGpsReal.has(c.id))
    .map((c) => { const p = posicionSimulada(RUTAS_DEMO[c.nombre], ahora); return { conductor_id: c.id, lat: p.lat, lng: p.lng, velocidad: 40, registrado_en: ts }; });
  if (!filas.length) return;
  const { error } = await sb.from("posiciones").insert(filas); // el trigger actualiza posicion_actual
  if (error) throw new Error(error.message);
}
