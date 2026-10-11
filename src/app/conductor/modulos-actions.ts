"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";
import { accionJornada, exigirModulo, guardarRevision, registrarIncidencia, subirFotoIncidencia, type Res } from "@/lib/conductor/modulos";
import { ACCIONES_JORNADA, type AccionJornada } from "@/lib/dominio/jornada";

const lento: Res = { ok: false, error: "Demasiadas peticiones. Espera un momento." };

export async function jornadaConductor(accion: AccionJornada): Promise<Res> {
  const yo = await exigirRol("conductor");
  if (!ACCIONES_JORNADA.includes(accion)) return { ok: false, error: "Acción no válida." };
  if (!permitir(`web-jornada:${yo.id}`, 20, 60_000)) return lento;
  const r = await accionJornada(clienteAdmin(), yo.id, accion);
  revalidatePath("/conductor", "layout");
  return r.ok ? r : { ok: false, error: r.error };
}

/** FormData: tipo, descripcion, servicio_id?, lat?, lng?, foto? (ya redimensionada en el navegador). */
export async function incidenciaConductor(fd: FormData): Promise<Res> {
  const yo = await exigirRol("conductor");
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
    foto_path, lat: num("lat"), lng: num("lng"),
  });
  return r.ok ? r : { ok: false, error: r.error };
}

export async function checklistConductor(p: { vehiculo_id: string; respuestas: Record<string, string>; observaciones: string }): Promise<Res> {
  const yo = await exigirRol("conductor");
  if (!permitir(`web-checklist:${yo.id}`, 10, 60_000)) return lento;
  const r = await guardarRevision(clienteAdmin(), yo.id, p);
  revalidatePath("/conductor", "layout");
  return r.ok ? r : { ok: false, error: r.error };
}
