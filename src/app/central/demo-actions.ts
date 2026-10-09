"use server";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { RUTAS_DEMO, posicionSimulada } from "@/lib/demo/rutas";
import { sembrarDemo } from "@/lib/demo/seed";

async function exigirDemo() {
  if (process.env.NEXT_PUBLIC_MODO_DEMO !== "true") throw new Error("Modo demo desactivado");
  await exigirRol("operador");
}

/** Inserta una posición por conductor demo, siguiendo su ruta. */
export async function simularPaso(): Promise<void> {
  await exigirDemo();
  const sb = clienteAdmin();
  const { data, error } = await sb.from("perfiles").select("id,nombre").eq("rol", "conductor");
  if (error) throw new Error(error.message);
  const ahora = Date.now(), ts = new Date(ahora).toISOString();
  for (const c of data ?? []) {
    const ruta = RUTAS_DEMO[c.nombre];
    if (!ruta) continue;
    const p = posicionSimulada(ruta, ahora);
    const r1 = await sb.from("posiciones").insert({ conductor_id: c.id, lat: p.lat, lng: p.lng, velocidad: 40, registrado_en: ts });
    if (r1.error) throw new Error(r1.error.message); // el trigger actualiza posicion_actual
  }
}

export async function restablecerDemo(): Promise<void> {
  await exigirDemo();
  const pass = process.env.DEMO_PASSWORD;
  if (!pass) throw new Error("Falta DEMO_PASSWORD");
  await sembrarDemo(clienteAdmin(), pass);
}
