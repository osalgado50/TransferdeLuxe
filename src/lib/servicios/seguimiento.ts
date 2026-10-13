import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularSeguimiento, esTokenSeguimiento, type ResultadoSeguimiento } from "@/lib/dominio/seguimiento";
import { motivoAviso, nombreDePila, type CanalAviso, type TipoAviso } from "@/lib/dominio/avisoCliente";
import { puedeConducir, type Rol } from "@/lib/dominio/tipos";

/** Estados en los que tiene sentido crear el enlace de seguimiento (desde aceptado). */
const ESTADOS_ENLACE = ["aceptado", "en_camino", "recogido"];
export const rutaSeguimiento = (token: string) => `/s/${token}`;

/** Token del servicio; lo crea si no existe (aleatorio de 32 bytes). Seguro ante dos peticiones a la vez. */
export async function asegurarSeguimiento(sb: SupabaseClient, servicioId: string): Promise<string> {
  const { data, error } = await sb.from("seguimientos").select("token").eq("servicio_id", servicioId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.token) return data.token as string;
  const token = randomBytes(32).toString("base64url");
  const ins = await sb.from("seguimientos").upsert({ servicio_id: servicioId, token }, { onConflict: "servicio_id", ignoreDuplicates: true });
  if (ins.error) throw new Error(ins.error.message);
  const { data: d2, error: e2 } = await sb.from("seguimientos").select("token").eq("servicio_id", servicioId).single();
  if (e2) throw new Error(e2.message);
  return d2.token as string;
}

/** Lo que devuelve la ruta pública: SOLO estado, posición, ETA, nombre de pila, modelo y matrícula. */
export async function leerSeguimiento(sb: SupabaseClient, token: string, ahora = new Date()): Promise<ResultadoSeguimiento | null> {
  if (!esTokenSeguimiento(token)) return null;
  const { data: seg, error } = await sb.from("seguimientos").select("servicio_id,caduca_en").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!seg) return null;
  if (seg.caduca_en && Date.parse(seg.caduca_en) < ahora.getTime()) return { ok: false, motivo: "caducado" };
  const { data: s, error: es } = await sb.from("servicios")
    .select("estado,conductor_id,vehiculo_id,origen_lat,origen_lng,destino_lat,destino_lng").eq("id", seg.servicio_id).maybeSingle();
  if (es) throw new Error(es.message);
  if (!s) return null;
  const [evs, pos, per] = await Promise.all([
    sb.from("eventos_servicio").select("tipo,motivo,creado_en").eq("servicio_id", seg.servicio_id)
      .in("tipo", ["aceptado", "en_camino", "llegando_recogida", "completado", "cancelado", "aviso_cliente"]).order("creado_en", { ascending: false }).limit(40),
    s.conductor_id ? sb.from("posicion_actual").select("lat,lng,registrado_en").eq("conductor_id", s.conductor_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    s.conductor_id ? sb.from("perfiles").select("nombre,vehiculo_habitual_id").eq("id", s.conductor_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const fallo = [evs, pos, per].find((x) => x.error);
  if (fallo?.error) throw new Error(fallo.error.message);
  const vehId = (s.vehiculo_id as string | null) ?? (per.data as { vehiculo_habitual_id: string | null } | null)?.vehiculo_habitual_id ?? null;
  const veh = vehId ? (await sb.from("vehiculos").select("modelo,matricula").eq("id", vehId).maybeSingle()).data : null;
  return calcularSeguimiento({
    servicio: s,
    eventos: (evs.data ?? []) as { tipo: string; motivo: string | null; creado_en: string }[],
    posicion: (pos.data as { lat: number; lng: number; registrado_en: string } | null) ?? null,
    conductor: (per.data as { nombre: string } | null)?.nombre ?? null,
    vehiculo: veh ? { modelo: veh.modelo ?? null, matricula: veh.matricula ?? null } : null,
    ahora,
  });
}

export interface ActorAviso { id: string; rol: Rol; conduce?: boolean; central: boolean }
export type DatosAvisoServidor = {
  ok: true; ruta: string | null; conductor: string | null; modelo: string | null; matricula: string | null;
  cliente: string | null; telefono: string | null; estado: string;
} | { ok: false; error: string; status: number };

/** ¿Este conductor devolvió el servicio hace poco? (tras devolver ya no es el asignado, pero puede avisar del cambio). */
async function loDevolvio(sb: SupabaseClient, servicioId: string, conductorId: string): Promise<boolean> {
  const { data } = await sb.from("eventos_servicio").select("actor_id,creado_en").eq("servicio_id", servicioId).eq("tipo", "devuelto")
    .order("creado_en", { ascending: false }).limit(1).maybeSingle();
  return !!data && data.actor_id === conductorId && Date.now() - Date.parse(data.creado_en) < 6 * 3600_000;
}

/**
 * Datos para redactar el aviso (enlace de seguimiento, nombre de pila del conductor, vehículo). Conductor: solo su
 * servicio (o el que acaba de devolver, sin enlace). Central: cualquiera. Crea el enlace si el estado lo permite.
 */
export async function datosAviso(sb: SupabaseClient, actor: ActorAviso, servicioId: string): Promise<DatosAvisoServidor> {
  const { data: s, error } = await sb.from("servicios")
    .select("id,estado,conductor_id,vehiculo_id,cliente_nombre,cliente_telefono").eq("id", servicioId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return { ok: false, error: "Servicio no encontrado", status: 404 };
  const propio = s.conductor_id === actor.id;
  if (!actor.central) {
    if (!puedeConducir(actor)) return { ok: false, error: "No tienes permiso", status: 403 };
    if (!propio && !(await loDevolvio(sb, servicioId, actor.id))) return { ok: false, error: "Este servicio ya no está asignado a ti", status: 409 };
  } else if (actor.rol !== "operador") return { ok: false, error: "No tienes permiso", status: 403 };
  const conDatos = !!s.conductor_id && ESTADOS_ENLACE.includes(s.estado);
  const ruta = conDatos ? rutaSeguimiento(await asegurarSeguimiento(sb, servicioId)) : null;
  let conductor: string | null = null, modelo: string | null = null, matricula: string | null = null;
  const yoId = s.conductor_id ?? (!actor.central ? actor.id : null);
  if (yoId) {
    const { data: p } = await sb.from("perfiles").select("nombre,vehiculo_habitual_id").eq("id", yoId).maybeSingle();
    conductor = nombreDePila(p?.nombre) || null;
    const vehId = s.vehiculo_id ?? p?.vehiculo_habitual_id ?? null;
    if (vehId) {
      const { data: v } = await sb.from("vehiculos").select("modelo,matricula").eq("id", vehId).maybeSingle();
      modelo = v?.modelo ?? null; matricula = v?.matricula ?? null;
    }
  }
  return { ok: true, ruta, conductor, modelo, matricula, cliente: s.cliente_nombre ?? null, telefono: s.cliente_telefono ?? null, estado: s.estado };
}

/**
 * Anota el evento `aviso_cliente` (motivo «en_camino», «retraso|sms»…) tras abrir WhatsApp/SMS. Idempotente por
 * idAccion (cola offline / reintentos). Mismos permisos que `datosAviso`.
 */
export async function registrarAvisoCliente(sb: SupabaseClient, actor: ActorAviso,
  p: { idAccion: string; servicioId: string; tipo: TipoAviso; canal: CanalAviso }): Promise<{ ok: true; duplicada?: true } | { ok: false; error: string; status: number }> {
  const { data: s, error } = await sb.from("servicios").select("id,conductor_id").eq("id", p.servicioId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return { ok: false, error: "Servicio no encontrado", status: 404 };
  if (!actor.central) {
    if (!puedeConducir(actor)) return { ok: false, error: "No tienes permiso", status: 403 };
    if (s.conductor_id !== actor.id && !(await loDevolvio(sb, p.servicioId, actor.id))) return { ok: false, error: "Este servicio ya no está asignado a ti", status: 409 };
  } else if (actor.rol !== "operador") return { ok: false, error: "No tienes permiso", status: 403 };
  const reg = await sb.from("acciones_procesadas").insert({ id: p.idAccion });
  if (reg.error) {
    if (reg.error.code === "23505") return { ok: true, duplicada: true };
    throw new Error(reg.error.message);
  }
  const ins = await sb.from("eventos_servicio").insert({ servicio_id: p.servicioId, tipo: "aviso_cliente", actor_id: actor.id, motivo: motivoAviso(p.tipo, p.canal) });
  if (ins.error) {
    await sb.from("acciones_procesadas").delete().eq("id", p.idAccion);
    throw new Error(ins.error.message);
  }
  return { ok: true };
}
