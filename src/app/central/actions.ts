"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase, type ResultadoAccion } from "@/lib/servicios/acciones";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";
import { ESTADOS_AGENDA, construirCandidatos } from "@/lib/dominio/planificacion";
import type { EstadoReserva } from "@/app/reservar/actions";

export async function accionCentral(p: { idAccion: string; servicioId: string; accion: "asignar" | "reasignar" | "cancelar" | "subcontratar"; conductorId?: string; vehiculoId?: string }): Promise<ResultadoAccion> {
  const yo = await exigirRol("operador");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "operador" } });
  revalidatePath("/central", "layout");
  return r;
}

export async function crearServicioManual(_: EstadoReserva, fd: FormData): Promise<EstadoReserva> {
  await exigirRol("operador");
  fd.set("acepta_privacidad", "on");
  const r = esquemaReserva.safeParse(Object.fromEntries(fd));
  if (!r.success) return { errores: r.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  const ids = await crearServicios(clienteAdmin(), serviciosDesdeReserva(r.data, "manual"));
  revalidatePath("/central", "layout");
  return { ok: true, mensaje: `Servicio creado (${ids.length})` };
}

export async function marcarIncidenciaVista(servicioId: string) {
  await exigirRol("operador");
  await clienteAdmin().from("servicios").update({ incidencia_vista: true }).eq("id", servicioId);
  revalidatePath("/central", "layout");
}

export async function obtenerSugerencias(servicioId: string) {
  await exigirRol("operador");
  const sb = clienteAdmin();
  const { data: s } = await sb.from("servicios").select("*").eq("id", servicioId).single();
  if (!s) return [];
  const inicio = new Date(s.fecha_hora_recogida);
  const desde = new Date(inicio.getTime() - 12 * 3600_000).toISOString();
  const hasta = new Date(inicio.getTime() + 12 * 3600_000).toISOString();
  const [{ data: conductores }, { data: vehiculos }, { data: posiciones }, { data: agenda }] = await Promise.all([
    sb.from("perfiles").select("id, nombre, vehiculo_habitual_id").eq("rol", "conductor"),
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
