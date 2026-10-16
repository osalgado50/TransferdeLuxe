"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";
import { construirDemo, NOTA_DEMO } from "@/lib/demo/datosDemo";

/**
 * Botones del panel en vivo para que quien evalúe la app la encuentre funcionando: cargar datos de demo, archivar todos
 * los servicios (con su historial) y deshacer el último archivado. Cualquier operador. Nunca lanzan: devuelven mensaje.
 */
export type ResultadoDemo = { ok: boolean; mensaje: string };
const GPS_REAL_MS = 15 * 60_000;
const refrescar = () => { revalidatePath("/central", "layout"); };
const fmt = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

export async function cargarDatosDemo(): Promise<ResultadoDemo> {
  const yo = await exigirRol("operador");
  if (!permitir(`demo-cargar:${yo.id}`, 5, 10 * 60_000)) return { ok: false, mensaje: "Espera un poco antes de volver a cargar datos de demo." };
  try {
    const sb = clienteAdmin();
    const desde = new Date(Date.now() - 6 * 3600e3).toISOString();
    const { count } = await sb.from("servicios").select("id", { count: "exact", head: true }).eq("notas", NOTA_DEMO).gte("fecha_hora_recogida", desde);
    if ((count ?? 0) > 0) return { ok: false, mensaje: `Ya hay ${count} servicios de demo cargados. Archiva primero si quieres empezar de cero.` };
    const [{ data: perfiles, error: e1 }, { data: reales }] = await Promise.all([
      sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").eq("rol", "conductor").order("nombre"),
      sb.from("posiciones").select("conductor_id").eq("simulada", false).gte("registrado_en", new Date(Date.now() - GPS_REAL_MS).toISOString()),
    ]);
    if (e1) throw new Error(e1.message);
    const conductores = (perfiles ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, vehiculoId: (p.vehiculo_habitual_id as string | null) ?? null }));
    const demo = construirDemo(new Date(), conductores);
    const conGpsReal = new Set((reales ?? []).map((r) => r.conductor_id as string));
    const { error: e2 } = await sb.from("servicios").insert(demo.servicios);
    if (e2) throw new Error(e2.message);
    const [r3, r4, r5] = await Promise.all([
      sb.from("eventos_servicio").insert(demo.eventos),
      demo.incidencias.length ? sb.from("incidencias").insert(demo.incidencias) : Promise.resolve({ error: null }),
      // Un coche con GPS real (un móvil de verdad en servicio) no se mueve a una posición inventada.
      sb.from("posiciones").insert(demo.posiciones.filter((p) => !conGpsReal.has(p.conductor_id))),
    ]);
    for (const r of [r3, r4, r5]) if (r.error) throw new Error(r.error.message);
    refrescar();
    return { ok: true, mensaje: `Cargados ${demo.servicios.length} servicios de demo (hoy y mañana), con su historial, una incidencia y los coches en el mapa.` };
  } catch (e) {
    console.error("[demo] cargar", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudieron cargar los datos de demo. Inténtalo de nuevo." };
  }
}

export async function archivarTodosLosServicios(): Promise<ResultadoDemo> {
  const yo = await exigirRol("operador");
  try {
    const { data, error } = await clienteAdmin().rpc("archivar_servicios", { p_actor: yo.id });
    if (error) throw new Error(error.message);
    const r = data as { lote: string | null; servicios: number };
    refrescar();
    return r.servicios ? { ok: true, mensaje: `Archivados ${r.servicios} servicios con todo su historial. Puedes recuperarlos con «Deshacer».` } : { ok: true, mensaje: "No había servicios que archivar." };
  } catch (e) {
    console.error("[demo] archivar", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudo archivar. No se ha tocado nada." };
  }
}

export async function deshacerArchivado(): Promise<ResultadoDemo> {
  await exigirRol("operador");
  try {
    const { data, error } = await clienteAdmin().rpc("restaurar_ultimo_archivo");
    if (error) throw new Error(error.message);
    const r = data as { lote: string | null; servicios: number };
    refrescar();
    return r.lote ? { ok: true, mensaje: `Recuperados ${r.servicios} servicios con su historial.` } : { ok: false, mensaje: "No hay nada archivado que recuperar." };
  } catch (e) {
    console.error("[demo] deshacer", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudo recuperar el archivo. No se ha tocado nada." };
  }
}

/** Último archivado que se puede deshacer (para el botón): «12 oct, 18:30 · 143 servicios». */
export async function ultimoArchivado(): Promise<string | null> {
  await exigirRol("operador");
  const { data } = await clienteAdmin().from("archivo_lotes").select("creado_en,servicios").is("restaurado_en", null).order("creado_en", { ascending: false }).limit(1).maybeSingle();
  return data ? `${fmt(data.creado_en as string)} · ${data.servicios} servicios` : null;
}
