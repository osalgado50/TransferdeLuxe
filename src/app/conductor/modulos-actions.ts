"use server";
import { revalidatePath } from "next/cache";
import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";
import { accionJornada, exigirModulo, guardarRevision, registrarCierre, registrarIncidencia, subirFotoIncidencia, type Res, type ResCierre } from "@/lib/conductor/modulos";
import { ACCIONES_JORNADA, rangosJornada, type AccionJornada } from "@/lib/dominio/jornada";
import { ESTADOS_PENDIENTE_HOY, pendientesHoy } from "@/lib/dominio/finJornada";
import { lugarBreve } from "@/lib/dominio/actividad";

const lento: Res = { ok: false, error: "Demasiadas peticiones. Espera un momento." };

export async function jornadaConductor(accion: AccionJornada): Promise<Res> {
  const yo = await exigirConductor();
  if (!ACCIONES_JORNADA.includes(accion)) return { ok: false, error: "Acción no válida." };
  if (!permitir(`web-jornada:${yo.id}`, 20, 60_000)) return lento;
  const r = await accionJornada(clienteAdmin(), yo.id, accion);
  revalidatePath("/conductor", "layout");
  return r.ok ? r : { ok: false, error: r.error };
}

/** FormData: tipo, descripcion, servicio_id?, lat?, lng?, zonas* (parte de golpes), foto? (ya redimensionada en el navegador). */
export async function incidenciaConductor(fd: FormData): Promise<Res> {
  const yo = await exigirConductor();
  if (!permitir(`web-incidencia:${yo.id}`, 10, 60_000)) return lento;
  const sb = clienteAdmin();
  const m = await exigirModulo(sb, "incidencias");
  if (!m.ok) return { ok: false, error: m.error };
  let foto_path: string | null = null;
  const foto = fd.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const f = await subirFotoIncidencia(sb, yo.id, foto);
    if (!f.ok) return { ok: false, error: f.error };
    foto_path = f.fotoPath;
  }
  const num = (k: string) => { const v = fd.get(k); return typeof v === "string" && v ? Number(v) : null; };
  const r = await registrarIncidencia(sb, yo.id, {
    tipo: fd.get("tipo"), descripcion: fd.get("descripcion") ?? "", servicio_id: fd.get("servicio_id") || null,
    foto_path, lat: num("lat"), lng: num("lng"), zonas: fd.getAll("zonas").map(String),
  });
  if (!r.ok && foto_path) await sb.storage.from("incidencias").remove([foto_path]); // sin fotos huérfanas
  return r.ok ? r : { ok: false, error: r.error };
}

export async function checklistConductor(p: { vehiculo_id: string; respuestas: Record<string, string>; observaciones: string }): Promise<Res> {
  const yo = await exigirConductor();
  if (!permitir(`web-checklist:${yo.id}`, 10, 60_000)) return lento;
  const r = await guardarRevision(clienteAdmin(), yo.id, p);
  revalidatePath("/conductor", "layout");
  return r.ok ? r : { ok: false, error: r.error };
}

/** Hoja de cierre de jornada (PWA): guarda el cierre y finaliza la jornada abierta en una transacción. */
export async function cierreConductor(p: unknown): Promise<ResCierre> {
  const yo = await exigirConductor();
  if (!permitir(`web-cierre:${yo.id}`, 10, 60_000)) return { ok: false, error: "Demasiadas peticiones. Espera un momento." };
  const r = await registrarCierre(clienteAdmin(), yo.id, p);
  revalidatePath("/conductor", "layout");
  return r.ok ? r : { ok: false, error: r.error };
}

/** Servicios de HOY aún por hacer (asignado/aceptado/en camino, recogida posterior a ahora): se preguntan al finalizar. */
export async function pendientesHoyConductor(): Promise<{ id: string; estado: string; fecha_hora_recogida: string; trayecto: string }[]> {
  const yo = await exigirConductor();
  const ahora = new Date();
  const { data } = await clienteAdmin().from("servicios").select("id,estado,fecha_hora_recogida,origen_texto,destino_texto")
    .eq("conductor_id", yo.id).in("estado", [...ESTADOS_PENDIENTE_HOY]).gt("fecha_hora_recogida", ahora.toISOString())
    .lt("fecha_hora_recogida", rangosJornada(ahora).hoy.hasta).limit(50);
  return pendientesHoy((data ?? []) as { id: string; estado: string; fecha_hora_recogida: string; origen_texto: string; destino_texto: string }[], ahora)
    .map((s) => ({ id: s.id, estado: s.estado, fecha_hora_recogida: s.fecha_hora_recogida, trayecto: `${lugarBreve(s.origen_texto)} → ${lugarBreve(s.destino_texto)}` }));
}
