import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { ejecutarAccion, repoSupabase, type ResultadoAccion } from "@/lib/servicios/acciones";
import { notificarServicioNuevo } from "@/lib/push";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";
import { ESTADOS_AGENDA, construirCandidatos } from "@/lib/dominio/planificacion";
import { rangosConductor } from "@/lib/dominio/dias";

/** Lógica de la central compartida por las Server Actions (web) y las rutas /api/central/* (app nativa). */
export type AccionOperador = "asignar" | "reasignar" | "cancelar" | "subcontratar";
export interface PeticionOperador { idAccion: string; servicioId: string; accion: AccionOperador; conductorId?: string; vehiculoId?: string }

/** Ejecuta la acción como operador. Devuelve además si hay que avisar por push al conductor asignado. */
export async function ejecutarAccionOperador(operadorId: string, p: PeticionOperador): Promise<{ r: ResultadoAccion; avisar: () => Promise<void> }> {
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: operadorId, rol: "operador" } });
  const toca = r.ok && !r.duplicada && (p.accion === "asignar" || p.accion === "reasignar");
  return { r, avisar: toca ? () => notificarServicioNuevo(p.servicioId) : async () => {} };
}

export async function marcarAlertaVista(servicioId: string): Promise<void> {
  const { error } = await clienteAdmin().from("servicios").update({ incidencia_vista: true }).eq("id", servicioId);
  if (error) throw new Error(error.message);
}

export async function sugerenciasServicio(servicioId: string) {
  const sb = clienteAdmin();
  const { data: s } = await sb.from("servicios").select("*").eq("id", servicioId).maybeSingle();
  if (!s) return null;
  const inicio = new Date(s.fecha_hora_recogida);
  const desde = new Date(inicio.getTime() - 12 * 3600_000).toISOString();
  const hasta = new Date(inicio.getTime() + 12 * 3600_000).toISOString();
  const [{ data: conductores }, { data: vehiculos }, { data: posiciones }, { data: agenda }] = await Promise.all([
    sb.from("perfiles").select("id, nombre, vehiculo_habitual_id").or(FILTRO_CONDUCEN),
    sb.from("vehiculos").select("*"),
    sb.from("posicion_actual").select("*"),
    sb.from("servicios").select("id, estado, conductor_id, fecha_hora_recogida, duracion_estimada_min, origen_lat, origen_lng, destino_lat, destino_lng, origen_texto, destino_texto")
      .in("estado", [...ESTADOS_AGENDA]).gte("fecha_hora_recogida", desde).lte("fecha_hora_recogida", hasta),
  ]);
  const gps: Record<string, Candidato["posicion"]> = {};
  for (const p of posiciones ?? []) if (p.en_servicio) gps[p.conductor_id] = { punto: { lat: p.lat, lng: p.lng }, registradoEn: new Date(p.registrado_en) };
  const candidatos = construirCandidatos(conductores ?? [], vehiculos ?? [], agenda ?? [], gps);
  const origen = s.origen_lat != null ? { lat: s.origen_lat, lng: s.origen_lng } : null;
  const destino = s.destino_lat != null ? { lat: s.destino_lat, lng: s.destino_lng } : null;
  return sugerirConductores({ id: s.id, inicio, duracionMin: s.duracion_estimada_min, pasajeros: s.pasajeros, maletas: s.maletas, origen,
    destino, origenTexto: s.origen_texto, destinoTexto: s.destino_texto }, candidatos, new Date())
    .map((sg) => {
      const v = vehiculos?.find((x) => x.id === conductores?.find((c) => c.id === sg.conductorId)?.vehiculo_habitual_id);
      return { ...sg, vehiculoId: v?.id ?? null, matricula: v?.matricula ?? null };
    });
}

const CAMPOS = "id,estado,conductor_id,vehiculo_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas,numero_vuelo,notas,cliente_nombre,cliente_telefono,origen_pedido,ultima_incidencia,incidencia_vista,subcontratar,asignado_en,plazo_respuesta_min";

/** Resumen para el modo central de la app nativa. */
export async function resumenCentral(ahora = new Date()) {
  const sb = clienteAdmin();
  const { hoy } = rangosConductor(ahora);
  const [alertas, pendientes, deHoy, pos, gente] = await Promise.all([
    sb.from("servicios").select(CAMPOS).eq("incidencia_vista", false).order("fecha_hora_recogida").limit(100),
    sb.from("servicios").select(CAMPOS).eq("estado", "pendiente").gte("fecha_hora_recogida", new Date(ahora.getTime() - 12 * 3600_000).toISOString()).order("fecha_hora_recogida").limit(200),
    sb.from("servicios").select(CAMPOS).gte("fecha_hora_recogida", hoy.desde).lt("fecha_hora_recogida", hoy.hasta).order("fecha_hora_recogida").limit(300),
    sb.from("posicion_actual").select("conductor_id,lat,lng,velocidad,en_servicio,registrado_en"),
    sb.from("perfiles").select("id,nombre,telefono,rol,conduce,vehiculo_habitual_id").or(FILTRO_CONDUCEN).order("nombre"),
  ]);
  const fallo = [alertas, pendientes, deHoy, pos, gente].find((x) => x.error);
  if (fallo?.error) throw new Error(fallo.error.message);
  const nombres = new Map((gente.data ?? []).map((p) => [p.id, p.nombre]));
  return {
    generadoEn: ahora.toISOString(),
    alertas: alertas.data ?? [],
    pendientes: pendientes.data ?? [],
    hoy: deHoy.data ?? [],
    posiciones: (pos.data ?? []).map((p) => ({ ...p, nombre: nombres.get(p.conductor_id) ?? null })),
    conductores: gente.data ?? [],
  };
}
