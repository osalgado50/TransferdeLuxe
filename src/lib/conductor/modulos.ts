import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerModulos, type ClaveModulo, type EstadoModulos } from "@/lib/dominio/modulos";
import { accionValida, estadoJornada, type AccionJornada, type Jornada } from "@/lib/dominio/jornada";
import { validarIncidencia } from "@/lib/dominio/incidencias";
import { validarRespuestas, type ItemChecklist } from "@/lib/dominio/checklist";
import { diaMadrid } from "@/lib/dominio/geo";
import { detectarTipoImagen, extensionDe } from "@/lib/firmaImagen";
import { z } from "zod";
import { COMBUSTIBLE, IDS_ZONAS, MAX_COMENTARIO, TESTIGOS, cierreObligatorio, gravedadCierre, normalizarZonas, validarKm, type GravedadCierre, type Tecnico } from "@/lib/dominio/cierre";

// Lógica de servidor de los módulos del conductor (jornada, incidencias, checklist), común a Server Actions y rutas API.
export type Res = { ok: true } | { ok: false; error: string; status?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function modulosActivos(sb: SupabaseClient): Promise<EstadoModulos> {
  const { data } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  return leerModulos(data?.modulos);
}
export async function exigirModulo(sb: SupabaseClient, clave: ClaveModulo): Promise<Res> {
  return (await modulosActivos(sb))[clave] ? { ok: true } : { ok: false, error: "Esta función está desactivada por la central.", status: 403 };
}

export async function jornadaAbierta(sb: SupabaseClient, conductorId: string): Promise<Jornada | null> {
  const { data } = await sb.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").eq("conductor_id", conductorId).is("fin", null).maybeSingle();
  return (data as Jornada | null) ?? null;
}

/** Sin ningún vehículo activo no se puede rellenar la hoja: la jornada se finaliza como antes. */
async function hayVehiculos(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.from("vehiculos").select("id").eq("estado", "activo").limit(1).maybeSingle();
  return !!data;
}

export async function accionJornada(sb: SupabaseClient, conductorId: string, accion: AccionJornada): Promise<Res> {
  const m = await exigirModulo(sb, "jornada");
  if (!m.ok) return m;
  const abierta = await jornadaAbierta(sb, conductorId);
  const estado = estadoJornada(abierta);
  // Con la hoja de cierre activa, la jornada se finaliza SOLO enviándola (POST /api/conductor/cierre o cierreConductor).
  if (accion === "finalizar" && estado !== "fuera" && cierreObligatorio(await modulosActivos(sb)) && await hayVehiculos(sb)) {
    return { ok: false, error: "Para finalizar la jornada rellena la hoja de cierre del vehículo (si no te aparece, actualiza la app).", status: 409 };
  }
  if (!accionValida(estado, accion)) {
    // Reintentos (doble toque, cola offline): si ya estamos en el estado buscado, no es un error.
    const yaHecho = (accion === "iniciar" && estado !== "fuera") || (accion === "pausa" && estado === "en_pausa")
      || (accion === "reanudar" && estado === "trabajando") || (accion === "finalizar" && estado === "fuera");
    return yaHecho ? { ok: true } : { ok: false, error: "Acción no válida en el estado actual de la jornada.", status: 409 };
  }
  const ahora = new Date().toISOString();
  let error: { code?: string } | null = null;
  if (accion === "iniciar") ({ error } = await sb.from("jornadas").insert({ conductor_id: conductorId, inicio: ahora }));
  else if (accion === "pausa") ({ error } = await sb.from("pausas").insert({ jornada_id: abierta!.id, inicio: ahora }));
  else {
    ({ error } = await sb.from("pausas").update({ fin: ahora }).eq("jornada_id", abierta!.id).is("fin", null));
    if (!error && accion === "finalizar") ({ error } = await sb.from("jornadas").update({ fin: ahora }).eq("id", abierta!.id).is("fin", null));
  }
  if (error && error.code !== "23505") return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo.", status: 500 };
  return { ok: true };
}

export async function registrarIncidencia(sb: SupabaseClient, conductorId: string, entrada: unknown): Promise<Res> {
  const m = await exigirModulo(sb, "incidencias");
  if (!m.ok) return m;
  const v = validarIncidencia(entrada, conductorId);
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  if (v.datos.servicio_id) {
    const { data } = await sb.from("servicios").select("id").eq("id", v.datos.servicio_id).eq("conductor_id", conductorId).maybeSingle();
    if (!data) return { ok: false, error: "Ese servicio no es tuyo.", status: 403 };
  }
  const { error } = await sb.from("incidencias").insert({ ...v.datos, conductor_id: conductorId });
  if (error) return { ok: false, error: "No se pudo enviar la incidencia.", status: 500 };
  return { ok: true };
}

export async function guardarRevision(sb: SupabaseClient, conductorId: string, entrada: unknown): Promise<Res> {
  const m = await exigirModulo(sb, "checklist");
  if (!m.ok) return m;
  const o = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const vehiculoId = typeof o.vehiculo_id === "string" && UUID.test(o.vehiculo_id) ? o.vehiculo_id : null;
  if (!vehiculoId) return { ok: false, error: "Elige el vehículo.", status: 400 };
  const observaciones = typeof o.observaciones === "string" ? o.observaciones.trim().slice(0, 1000) : "";
  const { data: items } = await sb.from("checklist_items").select("id,texto,orden,activo");
  const r = validarRespuestas(o.respuestas, (items ?? []) as ItemChecklist[]);
  if (!r.ok) return { ok: false, error: r.error, status: 400 };
  const { error } = await sb.from("checklist_revisiones").insert({
    conductor_id: conductorId, vehiculo_id: vehiculoId, fecha: diaMadrid(new Date()), respuestas: r.respuestas,
    observaciones, con_fallos: r.conFallos, revisada: !r.conFallos,
  });
  if (error?.code === "23505") return { ok: true }; // ya hecho hoy para ese vehículo
  if (error) return { ok: false, error: error.code === "23503" ? "El vehículo no existe." : "No se pudo guardar el checklist.", status: 400 };
  return { ok: true };
}

const MAX_FOTO = 5 * 1024 * 1024;
/** Sube una foto validada por firma al bucket privado `incidencias` bajo la carpeta del conductor. */
export async function subirFotoIncidencia(sb: SupabaseClient, conductorId: string, foto: unknown): Promise<{ ok: true; fotoPath: string } | { ok: false; error: string; status: number }> {
  if (!(foto instanceof File)) return { ok: false, error: "Falta la foto", status: 400 };
  if (foto.size > MAX_FOTO) return { ok: false, error: "La foto pesa más de 5 MB", status: 400 };
  const bytes = new Uint8Array(await foto.arrayBuffer());
  const tipo = detectarTipoImagen(bytes);
  if (!tipo) return { ok: false, error: "Formato no admitido", status: 400 };
  const fotoPath = `${conductorId}/${crypto.randomUUID()}.${extensionDe(tipo)}`;
  const { error } = await sb.storage.from("incidencias").upload(fotoPath, Buffer.from(bytes), { contentType: tipo });
  if (error) return { ok: false, error: "No se pudo guardar la foto", status: 500 };
  return { ok: true, fotoPath };
}

// ── Hoja de cierre de jornada ──
const bien = z.enum(["ok", "revisar"]);
const nivel = z.enum(["ok", "falta"]);
export const esquemaCierre = z.object({
  idAccion: z.string().uuid().optional().nullable(),
  vehiculo_id: z.string().uuid({ message: "Elige el vehículo." }),
  zonas: z.array(z.enum(IDS_ZONAS as [string, ...string[]])).max(IDS_ZONAS.length * 2).default([]),
  tecnico: z.object({
    neumaticos: bien, aceite: nivel, refrigerante: nivel, luces: bien, testigos_cuadro: bien, otra_averia: bien,
    testigos: z.array(z.enum(TESTIGOS.map((t) => t.id) as [string, ...string[]])).max(TESTIGOS.length * 2).optional(),
  }),
  combustible: z.enum(COMBUSTIBLE.map((c) => c.id) as [string, ...string[]], { message: "Indica el combustible." }),
  km: z.union([z.number(), z.string(), z.null()]).optional(),
  comentario: z.string().max(MAX_COMENTARIO, `El comentario admite como mucho ${MAX_COMENTARIO} caracteres.`).optional().default(""),
});

export type ResCierre = { ok: true; gravedad: GravedadCierre; duplicada: boolean } | { ok: false; error: string; status?: number };

/**
 * Envía la hoja de cierre y FINALIZA la jornada abierta en una sola transacción (RPC cerrar_jornada): inserta el cierre,
 * sube los km del vehículo (greatest) y cierra pausas y jornada. Idempotente por idAccion y por jornada.
 */
export async function registrarCierre(sb: SupabaseClient, conductorId: string, entrada: unknown): Promise<ResCierre> {
  const m = await exigirModulo(sb, "jornada");
  if (!m.ok) return m;
  const p = esquemaCierre.safeParse(entrada);
  if (!p.success) {
    const msg = p.error.issues[0]?.message ?? "";
    return { ok: false, error: /^(Elige|Indica|El comentario)/.test(msg) ? msg : "Datos no válidos.", status: 400 };
  }
  const d = p.data;
  const { data: v } = await sb.from("vehiculos").select("id,km_actuales").eq("id", d.vehiculo_id).maybeSingle();
  if (!v) return { ok: false, error: "El vehículo no existe.", status: 400 };
  const km = validarKm(d.km, v.km_actuales as number);
  if (!km.ok) return { ok: false, error: km.error, status: 400 };
  const tecnico: Tecnico = { ...d.tecnico, testigos: d.tecnico.testigos_cuadro === "ok" ? [] : [...new Set(d.tecnico.testigos ?? [])] } as Tecnico;
  const zonas = normalizarZonas(d.zonas);
  const gravedad = gravedadCierre({ zonas, tecnico, combustible: d.combustible });
  const { data, error } = await sb.rpc("cerrar_jornada", {
    p_conductor: conductorId, p_vehiculo: d.vehiculo_id, p_id_accion: d.idAccion ?? null, p_zonas: zonas, p_tecnico: tecnico,
    p_combustible: d.combustible, p_km: km.km, p_comentario: d.comentario.trim(), p_gravedad: gravedad,
  });
  if (error) return { ok: false, error: "No se pudo enviar la hoja de cierre. Inténtalo de nuevo.", status: 500 };
  const r = (data ?? {}) as { id?: string; duplicada?: boolean; error?: string };
  if (r.error === "sin_jornada") {
    // Reintento sin idAccion de un cierre que ya entró (p. ej. se cortó la respuesta): no es un error.
    const { data: ult } = await sb.from("cierres_jornada").select("gravedad,creado_en").eq("conductor_id", conductorId)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    if (ult && Date.now() - Date.parse(ult.creado_en as string) < 10 * 60_000) return { ok: true, gravedad: ult.gravedad as GravedadCierre, duplicada: true };
    return { ok: false, error: "No tienes ninguna jornada abierta.", status: 409 };
  }
  return { ok: true, gravedad, duplicada: !!r.duplicada };
}
