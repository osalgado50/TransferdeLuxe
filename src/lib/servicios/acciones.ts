import { transicion, type Accion } from "@/lib/dominio/estados";
import type { EstadoServicio, Rol, Servicio } from "@/lib/dominio/tipos";

export interface RepoServicios {
  obtener(id: string): Promise<Servicio | null>;
  actualizar(id: string, cambios: Partial<Servicio>, estadoEsperado: EstadoServicio): Promise<boolean>;
  insertarEvento(e: { servicio_id: string; tipo: string; actor_id: string | null; motivo?: string | null }): Promise<void>;
  registrarAccion(idAccion: string): Promise<boolean>;
  yaProcesada(idAccion: string): Promise<boolean>;
}
export interface PeticionAccion {
  idAccion: string; servicioId: string; accion: Accion; actor: { id: string; rol: Rol };
  motivo?: string; conductorId?: string; vehiculoId?: string;
}
export type ResultadoAccion = { ok: true; estado: EstadoServicio; duplicada?: boolean } | { ok: false; error: string };

export async function ejecutarAccion(repo: RepoServicios, p: PeticionAccion): Promise<ResultadoAccion> {
  const s = await repo.obtener(p.servicioId);
  if (!s) return { ok: false, error: "Servicio no encontrado" };
  // Idempotencia primero: un reintento llega cuando el estado ya avanzó y la transición fallaría.
  if (await repo.yaProcesada(p.idAccion)) return { ok: true, estado: s.estado, duplicada: true };

  if ((p.accion === "asignar" || p.accion === "reasignar") && !p.conductorId) return { ok: false, error: "Elige un conductor" };
  if (p.accion === "rechazar" && (!p.motivo || p.motivo.trim() === "" || p.motivo === "Otro"))
    return { ok: false, error: "Indica el motivo del rechazo" };

  const t = transicion(s.estado, p.accion, { rol: p.actor.rol, esAsignado: s.conductor_id === p.actor.id });
  if (!t.ok) return t;
  if (!(await repo.registrarAccion(p.idAccion))) return { ok: true, estado: s.estado, duplicada: true };

  const cambios: Partial<Servicio> = { estado: t.nuevo };
  if (p.accion === "asignar" || p.accion === "reasignar") {
    Object.assign(cambios, { conductor_id: p.conductorId, vehiculo_id: p.vehiculoId ?? null, asignado_en: new Date().toISOString(), incidencia_vista: true });
  }
  if (p.accion === "rechazar") {
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, ultima_incidencia: `rechazado: ${p.motivo}`, incidencia_vista: false });
  }
  if (!(await repo.actualizar(s.id, cambios, s.estado))) return { ok: false, error: "El servicio cambió mientras tanto; recarga" };
  await repo.insertarEvento({ servicio_id: s.id, tipo: t.evento, actor_id: p.actor.id, motivo: p.motivo ?? null });
  return { ok: true, estado: t.nuevo };
}

export function repoSupabase(sb: import("@supabase/supabase-js").SupabaseClient): RepoServicios {
  return {
    async obtener(id) { const { data } = await sb.from("servicios").select("*").eq("id", id).single(); return data as Servicio | null; },
    async actualizar(id, cambios, esperado) {
      const { data } = await sb.from("servicios").update(cambios).eq("id", id).eq("estado", esperado).select("id");
      return (data?.length ?? 0) > 0;
    },
    async insertarEvento(e) { await sb.from("eventos_servicio").insert(e); },
    async registrarAccion(id) { const { error } = await sb.from("acciones_procesadas").insert({ id }); return !error; },
    async yaProcesada(id) { const { data } = await sb.from("acciones_procesadas").select("id").eq("id", id).maybeSingle(); return !!data; },
  };
}
