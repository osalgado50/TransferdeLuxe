import { EN_MARCHA, estadoAntesDeCierreCentral, motivoCierreCentral, PREFIJO_DESASIGNADO, PREFIJO_DEVUELTO, transicion, type Accion } from "@/lib/dominio/estados";
import { comprobarDeshacer, type EventoPaso } from "@/lib/dominio/deshacer";
import type { EstadoServicio, Rol, Servicio } from "@/lib/dominio/tipos";

export interface RepoServicios {
  obtener(id: string): Promise<Servicio | null>;
  /** `conductorEsperado` (si se indica): el conductor leído también tiene que seguir siendo el mismo. */
  actualizar(id: string, cambios: Partial<Servicio>, estadoEsperado: EstadoServicio, conductorEsperado?: string | null): Promise<boolean>;
  insertarEvento(e: { servicio_id: string; tipo: string; actor_id: string | null; motivo?: string | null }): Promise<void>;
  /** Cambio + evento en una sola transacción (si el repo lo soporta). false = el estado ya no era el esperado. */
  actualizarConEvento?(id: string, cambios: Partial<Servicio>, estadoEsperado: EstadoServicio,
    e: { tipo: string; actor_id: string | null; motivo?: string | null }, conductorEsperado?: string | null): Promise<boolean>;
  /** Eventos del servicio (para «deshacer»: el último paso del conductor y si alguien actuó después). */
  eventosServicio?(id: string): Promise<EventoPaso[]>;
  registrarAccion(idAccion: string): Promise<boolean>;
  yaProcesada(idAccion: string): Promise<boolean>;
  liberarAccion(idAccion: string): Promise<void>;
}
export interface PeticionAccion {
  idAccion: string; servicioId: string; accion: Accion;
  /** `central`: solo lo pone el servidor en las rutas de la central (nunca viene del cuerpo de la petición). */
  actor: { id: string; rol: Rol; conduce?: boolean; central?: boolean };
  motivo?: string; conductorId?: string; vehiculoId?: string;
  /** Estado que vio quien pide la acción (la central): si ya no es ese, no se hace (p. ej. «deshacer la salida» cuando el conductor ya hizo CARGA). */
  estadoEsperado?: EstadoServicio;
}
export type ResultadoAccion = { ok: true; estado: EstadoServicio; duplicada?: boolean } | { ok: false; error: string };

export async function ejecutarAccion(repo: RepoServicios, p: PeticionAccion): Promise<ResultadoAccion> {
  const s = await repo.obtener(p.servicioId);
  if (!s) return { ok: false, error: "Servicio no encontrado" };
  if (p.estadoEsperado && s.estado !== p.estadoEsperado) {
    return { ok: false, error: `El servicio ha cambiado mientras tanto (ahora está «${s.estado.replace("_", " ")}»): revísalo antes de repetir la acción` };
  }
  // Servicio en marcha: la central solo actúa si lo veía así (lo dice `estadoEsperado`). Un diálogo, un arrastre o una
  // alerta abiertos antes de que el conductor saliera no deben quitarle el servicio sin querer.
  if (p.actor.central && p.accion !== "deshacer" && EN_MARCHA.includes(s.estado) && p.estadoEsperado !== s.estado) {
    return { ok: false, error: `El conductor ya está en marcha («${s.estado.replace("_", " ")}»): ábrelo y decide desde su ficha` };
  }
  if (p.accion === "reasignar" && EN_MARCHA.includes(s.estado) && p.conductorId === s.conductor_id) {
    return { ok: false, error: "Ese conductor ya lleva este servicio: elige a otro" };
  }
  // Idempotencia primero: un reintento llega cuando el estado ya avanzó y la transición fallaría.
  if (await repo.yaProcesada(p.idAccion)) return { ok: true, estado: s.estado, duplicada: true };

  if ((p.accion === "asignar" || p.accion === "reasignar") && !p.conductorId) return { ok: false, error: "Elige un conductor" };
  if (p.accion === "rechazar" && (!p.motivo || p.motivo.trim() === "" || p.motivo === "Otro"))
    return { ok: false, error: "Indica el motivo del rechazo" };
  if (p.accion === "devolver" && (!p.motivo || p.motivo.trim() === "" || p.motivo.trim() === "Otro"))
    return { ok: false, error: "Indica por qué no puedes hacer el servicio" };

  const t = transicion(s.estado, p.accion, { rol: p.actor.rol, conduce: p.actor.conduce, central: p.actor.central, esAsignado: s.conductor_id === p.actor.id });
  if (!t.ok) return t;
  let motivo = p.motivo ?? null;
  if (p.accion === "deshacer") {
    if (!p.actor.central && !repo.eventosServicio) return { ok: false, error: "No se puede comprobar el último paso" };
    const evs = p.actor.central ? [] : await repo.eventosServicio!(s.id);
    const c = comprobarDeshacer(s.estado, evs, { id: p.actor.id, central: p.actor.central }, new Date());
    if (!c.ok) return c;
    motivo = c.motivo;
  }
  let nuevo = t.nuevo;
  // Deshacer un «Cerrar como completado» de la central: vuelve al estado que tenía (no a «pasajeros a bordo»).
  if (p.accion === "deshacer" && p.actor.central && s.estado === "completado" && repo.eventosServicio) {
    const cierre = (await repo.eventosServicio(s.id)).find((e) => e.tipo === "completado");
    const previo = estadoAntesDeCierreCentral(cierre?.motivo);
    if (previo) { nuevo = previo; motivo = "Deshecho por la central: cierre"; }
  }
  if (!(await repo.registrarAccion(p.idAccion))) return { ok: true, estado: s.estado, duplicada: true };

  const cambios: Partial<Servicio> = { estado: nuevo };
  if (p.accion === "asignar" || p.accion === "reasignar") {
    Object.assign(cambios, { conductor_id: p.conductorId, vehiculo_id: p.vehiculoId ?? null, asignado_en: new Date().toISOString(), incidencia_vista: true });
  }
  if (p.accion === "subcontratar" && s.conductor_id) {
    // Se lo quitamos al conductor que no respondió: ya no debe verlo como servicio nuevo.
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, incidencia_vista: true });
  }
  // Aceptado, cancelado o subcontratado: la alerta que tuviera («Sin respuesta», rechazado, devuelto…) ya no aplica.
  if (p.accion === "aceptar" || p.accion === "cancelar" || p.accion === "subcontratar" || p.accion === "completar") cambios.incidencia_vista = true;
  if (p.accion === "completar") motivo = motivoCierreCentral(s.estado, p.motivo?.trim() || undefined).slice(0, 300);
  if (p.accion === "rechazar") {
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, ultima_incidencia: `rechazado: ${p.motivo}`, incidencia_vista: false });
  }
  if (p.accion === "devolver") {
    // Vuelve a «Sin asignar» con alerta para la central (que lo reasigna); el motivo queda en el evento «devuelto».
    motivo = p.motivo!.trim().slice(0, 300);
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, ultima_incidencia: `${PREFIJO_DEVUELTO}: ${motivo}`, incidencia_vista: false });
  }
  if (p.accion === "desasignar") {
    // La central se lo quita al conductor (vacaciones, baja…): «Sin asignar» con alerta para reasignarlo.
    motivo = (p.motivo?.trim() || "Para reasignar").slice(0, 300);
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, ultima_incidencia: `${PREFIJO_DESASIGNADO}: ${motivo}`, incidencia_vista: false });
  }
  try {
    const evento = { tipo: t.evento, actor_id: p.actor.id, motivo };
    const hecho = repo.actualizarConEvento
      // También el conductor leído: si la central reasignó mientras tanto (asignado → asignado), la acción no se aplica.
      ? await repo.actualizarConEvento(s.id, cambios, s.estado, evento, s.conductor_id ?? null)
      : await repo.actualizar(s.id, cambios, s.estado, s.conductor_id ?? null);
    if (!hecho) {
      await repo.liberarAccion(p.idAccion);
      return { ok: false, error: "El servicio cambió mientras tanto; recarga" };
    }
    if (!repo.actualizarConEvento) await repo.insertarEvento({ servicio_id: s.id, ...evento });
  } catch (e) {
    try { await repo.liberarAccion(p.idAccion); } catch { /* best effort */ }
    throw e;
  }
  return { ok: true, estado: nuevo };
}

export function repoSupabase(sb: import("@supabase/supabase-js").SupabaseClient): RepoServicios {
  return {
    async obtener(id) {
      const { data, error } = await sb.from("servicios").select("*").eq("id", id).single();
      if (error && error.code !== "PGRST116") throw new Error(error.message);
      return (data as Servicio | null) ?? null;
    },
    async actualizar(id, cambios, esperado, conductorEsperado) {
      let q = sb.from("servicios").update(cambios).eq("id", id).eq("estado", esperado);
      if (conductorEsperado !== undefined) q = conductorEsperado === null ? q.is("conductor_id", null) : q.eq("conductor_id", conductorEsperado);
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    async actualizarConEvento(id, cambios, esperado, e, conductorEsperado) {
      const { data, error } = await sb.rpc("transicion_servicio", {
        p_id: id, p_esperado: esperado, p_cambios: cambios, p_tipo: e.tipo, p_actor: e.actor_id, p_motivo: e.motivo ?? null,
        p_conductor_esperado: conductorEsperado ?? null, p_comprobar_conductor: conductorEsperado !== undefined,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async eventosServicio(id) {
      const { data, error } = await sb.from("eventos_servicio").select("id,tipo,actor_id,creado_en,motivo").eq("servicio_id", id)
        .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as EventoPaso[];
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
