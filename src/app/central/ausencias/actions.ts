"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccionOperador } from "@/lib/central/operaciones";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import { lugarBreve } from "@/lib/dominio/actividad";
import { NOMBRE_TIPO_AUSENCIA, serviciosAfectados, validarAusencia, type Ausencia } from "@/lib/dominio/ausencias";

export interface ServicioAfectado { id: string; fecha_hora_recogida: string; estado: string; trayecto: string }
export type ResultadoAusencia =
  | { ok: true; mensaje: string; ausenciaId: string; afectados: ServicioAfectado[]; motivo: string; conductor: string }
  | { ok: false; error: string };

const refrescar = () => { revalidatePath("/central/ausencias"); revalidatePath("/central", "layout"); };

/** Servicios asignados/aceptados del conductor dentro de la ausencia (para ofrecer «Devolver para reasignar»). */
async function afectadosDe(a: Ausencia): Promise<ServicioAfectado[]> {
  const { data } = await clienteAdmin().from("servicios").select("id,conductor_id,estado,fecha_hora_recogida,origen_texto,destino_texto")
    .eq("conductor_id", a.conductor_id).eq("es_prueba", false).in("estado", ["asignado", "aceptado"])
    .gte("fecha_hora_recogida", madridAUtc(a.desde, "00:00")).lt("fecha_hora_recogida", madridAUtc(sumarDias(a.hasta, 1), "00:00")).limit(200);
  type F = { id: string; conductor_id: string | null; estado: string; fecha_hora_recogida: string; origen_texto: string; destino_texto: string };
  return serviciosAfectados(a, (data ?? []) as F[]).map((s) => ({ id: s.id, fecha_hora_recogida: s.fecha_hora_recogida, estado: s.estado,
    trayecto: `${lugarBreve(s.origen_texto)} → ${lugarBreve(s.destino_texto)}` }));
}

/** Alta (sin id) o edición (con id) de una ausencia. Devuelve los servicios que caen dentro. */
export async function guardarAusencia(_: ResultadoAusencia | null, fd: FormData): Promise<ResultadoAusencia> {
  const yo = await exigirRol("operador");
  const id = String(fd.get("id") ?? "");
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Ausencia no válida." };
  const v = validarAusencia(Object.fromEntries(fd));
  if (!v.ok) return v;
  const sb = clienteAdmin();
  const { data: c } = await sb.from("perfiles").select("id,nombre").eq("id", v.datos.conductor_id).maybeSingle();
  if (!c) return { ok: false, error: "El conductor no existe." };
  const { data, error } = id
    ? await sb.from("ausencias").update(v.datos).eq("id", id).select("id")
    : await sb.from("ausencias").insert({ ...v.datos, creado_por: yo.id }).select("id");
  if (error) return { ok: false, error: "No se pudo guardar la ausencia. Inténtalo de nuevo." };
  if (!data?.length) return { ok: false, error: "La ausencia ya no existe." };
  refrescar();
  const afectados = await afectadosDe(v.datos);
  return { ok: true, mensaje: id ? "Ausencia actualizada." : "Ausencia guardada.", ausenciaId: data[0].id as string, afectados,
    motivo: `Ausencia: ${NOMBRE_TIPO_AUSENCIA[v.datos.tipo]}`, conductor: c.nombre as string };
}

export async function borrarAusencia(id: string): Promise<{ ok: boolean; error?: string }> {
  await exigirRol("operador");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Ausencia no válida." };
  const { error } = await clienteAdmin().from("ausencias").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar la ausencia." };
  refrescar();
  return { ok: true };
}

/**
 * «Devolver para reasignar»: la central quita los servicios al conductor ausente (acción «desasignar», atómica e
 * idempotente): vuelven a «Sin asignar» con alerta para reasignarlos y el conductor recibe un aviso.
 */
export async function devolverParaReasignar(p: { lote: string; servicioIds: string[]; motivo: string }): Promise<{ hechos: number; errores: string[] }> {
  const yo = await exigirRol("operador");
  const ok = z.object({ lote: z.string().uuid(), servicioIds: z.array(z.string().uuid()).min(1).max(200), motivo: z.string().trim().min(1).max(120) }).safeParse(p);
  if (!ok.success) return { hechos: 0, errores: ["Datos no válidos."] };
  let hechos = 0;
  const errores: string[] = [];
  const avisos: (() => Promise<void>)[] = [];
  for (const servicioId of ok.data.servicioIds) {
    // Un doble clic o un reintento del mismo lote no duplica nada.
    const { r, avisar } = await ejecutarAccionOperador(yo.id, { idAccion: idDe(ok.data.lote, servicioId), servicioId, accion: "desasignar", motivo: ok.data.motivo });
    if (r.ok) { hechos++; avisos.push(avisar); } else errores.push(r.error);
  }
  refrescar();
  after(async () => { for (const a of avisos) await a().catch(() => {}); });
  return { hechos, errores };
}

/** idAccion determinista (formato UUID) por lote y servicio, como en la asignación automática. */
function idDe(lote: string, servicioId: string): string {
  const h = createHash("sha256").update(`desasignar:${lote}:${servicioId}`).digest("hex").slice(0, 32).split("");
  h[12] = "5";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const x = h.join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
