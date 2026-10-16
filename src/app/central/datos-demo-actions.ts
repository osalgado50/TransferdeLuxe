"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";
import { enEvaluacion } from "@/lib/demo/datosDemo";
import { cargarDemo, demoVisible } from "@/lib/demo/demoViva";

/**
 * Botones del panel en vivo para que quien evalúe la app la encuentre funcionando: cargar datos de demo, archivar todos
 * los servicios (con su historial; del 20 al 27/10, solo la demo) y deshacer el último archivado. Cualquier operador. Nunca lanzan: devuelven mensaje.
 */
export type ResultadoDemo = { ok: boolean; mensaje: string };
const refrescar = () => { revalidatePath("/central", "layout"); };
const fmt = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));

export async function cargarDatosDemo(): Promise<ResultadoDemo> {
  const yo = await exigirRol("operador");
  if (!permitir(`demo-cargar:${yo.id}`, 5, 10 * 60_000)) return { ok: false, mensaje: "Espera un poco antes de volver a cargar datos de demo." };
  try {
    const sb = clienteAdmin();
    const ya = await demoVisible(sb);
    if (ya > 0) return { ok: false, mensaje: `Ya hay ${ya} servicios de demo cargados. Archiva primero si quieres empezar de cero.` };
    const n = await cargarDemo(sb);
    refrescar();
    return { ok: true, mensaje: `Cargados ${n} servicios de demo (hoy y mañana), con su historial, una incidencia y los coches en el mapa.` };
  } catch (e) {
    console.error("[demo] cargar", e instanceof Error ? e.message : e);
    return { ok: false, mensaje: "No se pudieron cargar los datos de demo. Inténtalo de nuevo." };
  }
}

export async function archivarTodosLosServicios(): Promise<ResultadoDemo> {
  const yo = await exigirRol("operador");
  try {
    // Durante la evaluación la cuenta es compartida con el jurado: solo se retira la demo.
    const soloDemo = enEvaluacion(Date.now());
    const { data, error } = await clienteAdmin().rpc("archivar_servicios", { p_actor: yo.id, p_solo_demo: soloDemo });
    if (error) throw new Error(error.message);
    const r = data as { lote: string | null; servicios: number };
    refrescar();
    const que = soloDemo ? "servicios de demo" : "servicios";
    return r.servicios ? { ok: true, mensaje: `Archivados ${r.servicios} ${que} con todo su historial. Puedes recuperarlos con «Deshacer».` } : { ok: true, mensaje: `No había ${que} que archivar.` };
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
