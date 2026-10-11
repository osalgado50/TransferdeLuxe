import { transicion, type Accion } from "@/lib/dominio/estados";
import type { EstadoServicio, Rol, Servicio } from "@/lib/dominio/tipos";

export interface RepoServicios {
  obtener(id: string): Promise<Servicio | null>;
  actualizar(id: string, cambios: Partial<Servicio>, estadoEsperado: EstadoServicio): Promise<boolean>;
  insertarEvento(e: { servicio_id: string; tipo: string; actor_id: string | null; motivo?: string | null }): Promise<void>;
  registrarAccion(idAccion: string): Promise<boolean>;
  yaProcesada(idAccion: string): Promise<boolean>;
  liberarAccion(idAccion: string): Promise<void>;
}
export interface PeticionAccion {
  idAccion: string; servicioId: string; accion: Accion; actor: { id: string; rol: Rol; conduce?: boolean };
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

  const t = transicion(s.estado, p.accion, { rol: p.actor.rol, conduce: p.actor.conduce, esAsignado: s.conductor_id === p.actor.id });
  if (!t.ok) return t;
  if (!(await repo.registrarAccion(p.idAccion))) return { ok: true, estado: s.estado, duplicada: true };

  const cambios: Partial<Servicio> = { estado: t.nuevo };
  if (p.accion === "asignar" || p.accion === "reasignar") {
    Object.assign(cambios, { conductor_id: p.conductorId, vehiculo_id: p.vehiculoId ?? null, asignado_en: new Date().toISOString(), incidencia_vista: true });
  }
  if (p.accion === "rechazar") {
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, ultima_incidencia: `rechazado: ${p.motivo}`, incidencia_vista: false });
  }
  try {
    if (!(await repo.actualizar(s.id, cambios, s.estado))) {
      await repo.liberarAccion(p.idAccion);
      return { ok: false, error: "El servicio cambió mientras tanto; recarga" };
    }
    await repo.insertarEvento({ servicio_id: s.id, tipo: t.evento, actor_id: p.actor.id, motivo: p.motivo ?? null });
  } catch (e) {
    try { await repo.liberarAccion(p.idAccion); } catch { /* best effort */ }
    throw e;
  }
  return { ok: true, estado: t.nuevo };
}

export function repoSupabase(sb: import("@supabase/supabase-js").SupabaseClient): RepoServicios {
  return {
    async obtener(id) {
      const { data, error } = await sb.from("servicios").select("*").eq("id", id).single();
      if (error && error.code !== "PGRST116") throw new Error(error.message);
      return (data as Servicio | null) ?? null;
    },
    async actualizar(id, cambios, esperado) {
      const { data, error } = await sb.from("servicios").update(cambios).eq("id", id).eq("estado", esperado).select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    async insertarEvento(e) {
      const { error } = await sb.from("eventos_servicio").insert(e);
      if (error) throw new Error(error.message);
    },
    async registrarAccion(id) {
      const { error } = await sb.from("acciones_procesadas").insert({ id });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(error.message);
    },
    async yaProcesada(id) {
      const { data, error } = await sb.from("acciones_procesadas").select("id").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
    async liberarAccion(id) {
      const { error } = await sb.from("acciones_procesadas").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
