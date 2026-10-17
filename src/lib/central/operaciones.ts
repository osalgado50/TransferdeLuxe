import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { ejecutarAccion, repoSupabase, type ResultadoAccion } from "@/lib/servicios/acciones";
import { notificarAConductor, notificarServicioNuevo } from "@/lib/push";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";
import { conexionConductor } from "@/lib/dominio/conexionConductor";
import { ESTADOS_AGENDA, construirCandidatos } from "@/lib/dominio/planificacion";
import { rangosConductor } from "@/lib/dominio/dias";
import { indicadoresHoy } from "@/lib/central/puntualidad";
import { construirActividad, HORAS_ACTIVIDAD, TIPOS_GRAVES, type CierreAct, type ServicioAct } from "@/lib/dominio/actividad";
import { cargarDisponibilidad, cargarHorarios, disponibilidadDe } from "@/lib/central/disponibilidad";
import { ausenciaEn, motivoAsignadoAusente } from "@/lib/dominio/ausencias";
import { diaMadrid } from "@/lib/dominio/geo";
import { cabeServicio, motivoAsignadoFueraHorario, vehiculoDelTurno } from "@/lib/dominio/horarios";
import { aPlan, aTramo } from "@/lib/dominio/planificacion";
import type { EstadoServicio } from "@/lib/dominio/tipos";

/** Lógica de la central compartida por las Server Actions (web) y las rutas /api/central/* (app nativa). */
export type AccionOperador = "asignar" | "reasignar" | "cancelar" | "subcontratar" | "deshacer" | "desasignar" | "completar";
export interface PeticionOperador { idAccion: string; servicioId: string; accion: AccionOperador; conductorId?: string; vehiculoId?: string;
  /** Solo «desasignar»: por qué se le quita (p. ej. «Ausencia: vacaciones»). */
  motivo?: string;
  /** Estado que veía el operador: si el servicio ya no está así, no se hace (el conductor avanzó mientras tanto). */
  estadoEsperado?: EstadoServicio }

/** Ejecuta la acción como operador. Devuelve además si hay que avisar por push al conductor asignado. */
export async function ejecutarAccionOperador(operadorId: string, p: PeticionOperador): Promise<{ r: ResultadoAccion; avisar: () => Promise<void> }> {
  // Asignar a mano a un conductor ausente (vacaciones, baja…) o fuera de su horario: no se impide (apps antiguas,
  // urgencias), pero queda registrado en el evento.
  const asigna = (p.accion === "asignar" || p.accion === "reasignar") && !!p.conductorId;
  const hz = asigna ? await horarioDeAsignacion(p.servicioId, p.conductorId!) : {};
  const motivo = asigna ? (await motivoSiAusente(p.servicioId, p.conductorId!)) ?? hz.motivo : undefined;
  // Sin vehículo indicado: el del turno de ese día (el coche que coge en la base), si lo hay.
  if (asigna && !p.vehiculoId && hz.vehiculoId) p = { ...p, vehiculoId: hz.vehiculoId };
  // A quién se le quita (para avisarle), leído antes de cambiar: desasignar, reasignar a otro, subcontratar o cancelar.
  const quita = p.accion === "desasignar" || p.accion === "reasignar" || p.accion === "subcontratar" || p.accion === "cancelar" || p.accion === "completar";
  const antes = quita
    ? (await clienteAdmin().from("servicios").select("conductor_id,fecha_hora_recogida,origen_texto").eq("id", p.servicioId).maybeSingle()).data
    : null;
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, ...(motivo ? { motivo } : {}), actor: { id: operadorId, rol: "operador", central: true } });
  const toca = r.ok && !r.duplicada && (p.accion === "asignar" || p.accion === "reasignar");
  // Relevo con el cliente a bordo: el nuevo conductor no tiene que aceptar ni ir a la recogida, solo llevarlo al destino.
  const relevo = toca && r.ok && r.estado === "recogido";
  const avisarNuevo = relevo
    ? async () => {
      const { data: s } = await clienteAdmin().from("servicios").select("destino_texto,cliente_nombre").eq("id", p.servicioId).maybeSingle();
      await notificarAConductor(p.conductorId!, "Relevo: cliente a bordo",
        `La central te pasa el servicio de ${s?.cliente_nombre ?? "un cliente"} ya recogido. Destino: ${s?.destino_texto ?? "—"}`, { tipo: "servicio_relevo", servicioId: p.servicioId });
    }
    : () => notificarServicioNuevo(p.servicioId);
  // El conductor que lo pierde se entera al momento (si no, con la ficha abierta podía salir hacia la recogida).
  const pierde = antes?.conductor_id && !(p.accion === "reasignar" && p.conductorId === antes.conductor_id) ? (antes.conductor_id as string) : null;
  if (r.ok && !r.duplicada && pierde && antes) {
    const hora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(antes.fecha_hora_recogida));
    const porque = p.accion === "cancelar" ? "ha cancelado" : p.accion === "subcontratar" ? "ha subcontratado" : p.accion === "reasignar" ? "ha pasado a otro conductor"
      : p.accion === "completar" ? "ha dado por terminado" : "te ha quitado";
    const titulo = p.accion === "cancelar" ? "Servicio cancelado" : p.accion === "completar" ? "Servicio cerrado" : "Servicio retirado";
    const avisoRetirado = () => notificarAConductor(pierde, titulo, `La central ${porque} el servicio de las ${hora} (${antes.origen_texto})`, { tipo: "servicio_retirado", servicioId: p.servicioId });
    return { r, avisar: async () => { await avisoRetirado(); if (toca) await avisarNuevo(); } };
  }
  return { r, avisar: toca ? avisarNuevo : async () => {} };
}

/** «ausente: vacaciones» si el conductor tiene una ausencia el día/franja del servicio; undefined si no (o si falla). */
async function motivoSiAusente(servicioId: string, conductorId: string): Promise<string | undefined> {
  try {
    const sb = clienteAdmin();
    const { data: s } = await sb.from("servicios").select("fecha_hora_recogida").eq("id", servicioId).maybeSingle();
    if (!s) return undefined;
    const dia = diaMadrid(s.fecha_hora_recogida);
    const { data } = await sb.from("ausencias").select("conductor_id,desde,hasta,franja,tipo").eq("conductor_id", conductorId).lte("desde", dia).gte("hasta", dia);
    const a = ausenciaEn((data ?? []) as Parameters<typeof ausenciaEn>[0], conductorId, s.fecha_hora_recogida);
    if (a) console.warn(`[central] asignación a un conductor ausente (${a.tipo}) · servicio ${servicioId}`);
    return a ? motivoAsignadoAusente(a) : undefined;
  } catch { return undefined; }
}

/**
 * Horario del conductor para esa asignación: `motivo` «fuera_horario: Fuera de horario (pausa 13:00–16:00)» si el servicio
 * no cabe (se registra, no se impide) y `vehiculoId` del turno de ese día. Vacío sin horario o si algo falla.
 */
async function horarioDeAsignacion(servicioId: string, conductorId: string): Promise<{ motivo?: string; vehiculoId?: string }> {
  try {
    const sb = clienteAdmin();
    const { data: s } = await sb.from("servicios").select("id,fecha_hora_recogida,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng,origen_texto,destino_texto").eq("id", servicioId).maybeSingle();
    if (!s) return {};
    const dia = diaMadrid(s.fecha_hora_recogida);
    const { horarios, base } = await cargarHorarios(sb, dia, dia);
    const h = horarios.get(conductorId);
    if (!h) return {};
    const vehiculoId = vehiculoDelTurno(h, dia) ?? undefined;
    const inicio = Date.parse(s.fecha_hora_recogida);
    const { data: agenda } = await sb.from("servicios").select("id,fecha_hora_recogida,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng,origen_texto,destino_texto")
      .eq("conductor_id", conductorId).eq("es_prueba", false).in("estado", [...ESTADOS_AGENDA]).neq("id", servicioId)
      .gte("fecha_hora_recogida", new Date(inicio - 16 * 3600e3).toISOString()).lte("fecha_hora_recogida", new Date(inicio + 16 * 3600e3).toISOString()).limit(100);
    const p = aPlan(s);
    const r = cabeServicio(h, p, { base, agenda: (agenda ?? []).map((x) => { const t = aTramo(aPlan(x)); return { id: x.id, inicio: t.inicio.getTime(), fin: t.fin.getTime() }; }) });
    if (r.cabe) return { vehiculoId };
    console.warn(`[central] asignación fuera de horario · servicio ${servicioId} · ${r.motivo}`);
    return { motivo: motivoAsignadoFueraHorario(r.motivo!), vehiculoId };
  } catch { return {}; }
}

export async function marcarAlertaVista(servicioId: string): Promise<void> {
  const { error } = await clienteAdmin().from("servicios").update({ incidencia_vista: true }).eq("id", servicioId);
  if (error) throw new Error(error.message);
}

/** «Visto» en una hoja de cierre (app nativa, modo central). false si no existe. */
export async function marcarCierreVisto(cierreId: string): Promise<boolean> {
  const { data, error } = await clienteAdmin().from("cierres_jornada").update({ visto: true }).eq("id", cierreId).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Marca una incidencia como resuelta (botón «Resuelta» de lo grave en la app). false si no existe. */
export async function resolverIncidenciaOperador(incidenciaId: string): Promise<boolean> {
  const { data, error } = await clienteAdmin().from("incidencias").update({ resuelta: true, resuelta_en: new Date().toISOString() })
    .eq("id", incidenciaId).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function sugerenciasServicio(servicioId: string) {
  const sb = clienteAdmin();
  const { data: s } = await sb.from("servicios").select("*").eq("id", servicioId).maybeSingle();
  if (!s) return null;
  // Para reasignar o hacer un relevo no se ofrece al conductor que ya lo lleva.
  const sug = await sugerenciasPara(sb, s);
  return s.conductor_id ? sug.filter((g) => g.conductorId !== s.conductor_id) : sug;
}

type ServicioSugerible = Parameters<typeof aPlan>[0] & { id: string; fecha_hora_recogida: string; pasajeros: number; maletas: number;
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null; origen_texto: string; destino_texto: string };

/**
 * ¿Hay algún conductor libre para estos servicios (aún sin crear)? Mismo criterio que las sugerencias de la central:
 * horario, ausencias, jornada, otros servicios, plazas y maletas. Lo que ningún coche propio puede llevar (grupos
 * grandes) se subcontrata y no cuenta. Si algo falla, true: nunca se bloquea una reserva por un error al comprobarlo.
 */
export async function hayConductorLibre(servicios: (Omit<ServicioSugerible, "id"> & { subcontratar?: boolean })[]): Promise<boolean> {
  try {
    const sb = clienteAdmin();
    for (const [i, x] of servicios.entries()) {
      const sug = await sugerenciasPara(sb, { ...x, id: `reserva-${i}` });
      // Ningún vehículo propio con plazas/maletas: va a subcontratar, no es falta de hueco.
      if (sug.length && sug.every((g) => g.motivos.some((m) => /plazas|maletas|Sin vehículo/.test(m)))) continue;
      if (!sug.some((g) => g.apto)) return false;
    }
    return true;
  } catch (e) {
    console.error("[reserva] comprobar hueco:", e instanceof Error ? e.message : e);
    return true;
  }
}

export async function sugerenciasPara(sb: ReturnType<typeof clienteAdmin>, s: ServicioSugerible) {
  const inicio = new Date(s.fecha_hora_recogida);
  const desde = new Date(inicio.getTime() - 12 * 3600_000).toISOString();
  const hasta = new Date(inicio.getTime() + 12 * 3600_000).toISOString();
  const [{ data: conductores }, { data: vehiculos }, { data: posiciones }, { data: agenda }, { data: aj }, disp] = await Promise.all([
    sb.from("perfiles").select("id, nombre, vehiculo_habitual_id").or(FILTRO_CONDUCEN),
    sb.from("vehiculos").select("*"),
    sb.from("posicion_actual").select("*"),
    sb.from("servicios").select("id, estado, conductor_id, fecha_hora_recogida, duracion_estimada_min, origen_lat, origen_lng, destino_lat, destino_lng, origen_texto, destino_texto").eq("es_prueba", false)
      .in("estado", [...ESTADOS_AGENDA]).gte("fecha_hora_recogida", desde).lte("fecha_hora_recogida", hasta),
    sb.from("ajustes").select("umbral_sin_senal_min").eq("id", 1).maybeSingle(),
    cargarDisponibilidad(sb, diaMadrid(inicio), diaMadrid(inicio)),
  ]);
  const ahora = new Date();
  const gps: Record<string, Candidato["posicion"]> = {};
  for (const p of posiciones ?? []) if (p.en_servicio) gps[p.conductor_id] = { punto: { lat: p.lat, lng: p.lng }, registradoEn: new Date(p.registrado_en) };
  // Ausencias, jornada cerrada hoy y horario: «No disponible · vacaciones», «Jornada cerrada hoy», «Fuera de horario (pausa…)».
  // Vehículo: el del turno de ese día si lo hay (relevo en la base); si no, el habitual.
  const dia = diaMadrid(inicio);
  const vehiculoDe = (id: string) => {
    const turno = vehiculoDelTurno(disp.horarios.get(id), dia);
    return vehiculos?.find((x) => x.id === (turno ?? conductores?.find((c) => c.id === id)?.vehiculo_habitual_id));
  };
  const candidatos = construirCandidatos((conductores ?? []).map((c) => ({ ...c, vehiculo_habitual_id: vehiculoDe(c.id)?.id ?? c.vehiculo_habitual_id })),
    vehiculos ?? [], agenda ?? [], gps).map((c) => ({ ...c, ...disponibilidadDe(disp, c.conductorId) }));
  const origen = s.origen_lat != null && s.origen_lng != null ? { lat: s.origen_lat, lng: s.origen_lng } : null;
  const destino = s.destino_lat != null && s.destino_lng != null ? { lat: s.destino_lat, lng: s.destino_lng } : null;
  const duracionMin = aPlan(s).duracionMin;
  return sugerirConductores({ id: s.id, inicio, duracionMin, pasajeros: s.pasajeros, maletas: s.maletas, origen,
    destino, origenTexto: s.origen_texto, destinoTexto: s.destino_texto }, candidatos, new Date(), { base: disp.base })
    .map((sg) => {
      const v = vehiculoDe(sg.conductorId);
      const conexion = conexionConductor(posiciones?.find((p) => p.conductor_id === sg.conductorId), ahora, aj?.umbral_sin_senal_min ?? 5);
      return { ...sg, vehiculoId: v?.id ?? null, matricula: v?.matricula ?? null, conexion };
    });
}

const CAMPOS = "id,estado,conductor_id,vehiculo_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas,numero_vuelo,notas,cliente_nombre,cliente_telefono,origen_pedido,ultima_incidencia,incidencia_vista,subcontratar,asignado_en,plazo_respuesta_min";

/** Resumen para el modo central de la app nativa. */
export async function resumenCentral(ahora = new Date()) {
  const sb = clienteAdmin();
  const { hoy } = rangosConductor(ahora);
  const [alertas, pendientes, deHoy, pos, gente] = await Promise.all([
    sb.from("servicios").select(CAMPOS).eq("es_prueba", false).eq("incidencia_vista", false).order("fecha_hora_recogida").limit(100),
    sb.from("servicios").select(CAMPOS).eq("es_prueba", false).eq("estado", "pendiente").gte("fecha_hora_recogida", new Date(ahora.getTime() - 12 * 3600_000).toISOString()).order("fecha_hora_recogida").limit(200),
    sb.from("servicios").select(CAMPOS).eq("es_prueba", false).gte("fecha_hora_recogida", hoy.desde).lt("fecha_hora_recogida", hoy.hasta).order("fecha_hora_recogida").limit(300),
    sb.from("posicion_actual").select("conductor_id,lat,lng,velocidad,en_servicio,registrado_en"),
    sb.from("perfiles").select("id,nombre,telefono,rol,conduce,vehiculo_habitual_id").or(FILTRO_CONDUCEN).order("nombre"),
  ]);
  const fallo = [alertas, pendientes, deHoy, pos, gente].find((x) => x.error);
  if (fallo?.error) throw new Error(fallo.error.message);
  const nombres = new Map((gente.data ?? []).map((p) => [p.id, p.nombre]));
  const [act, puntualidad] = await Promise.all([actividadCentral(sb, ahora, gente.data ?? [], pos.data ?? []), indicadoresHoy(sb, ahora)]);
  return {
    ...act,
    generadoEn: ahora.toISOString(),
    alertas: alertas.data ?? [],
    pendientes: pendientes.data ?? [],
    hoy: deHoy.data ?? [],
    posiciones: (pos.data ?? []).map((p) => ({ ...p, nombre: nombres.get(p.conductor_id) ?? null })),
    conductores: gente.data ?? [],
    /** Semáforo de llegada a la recogida por id de servicio (asignado/aceptado/en camino de hoy), calculado aquí. */
    puntualidad,
  };
}

const CAMPOS_ACT = "id,cliente_nombre,origen_texto,destino_texto,fecha_hora_recogida,conductor_id,origen_pedido";

/**
 * «Actividad en vivo» para la app: últimos movimientos de las últimas 12 h ya redactados (misma lógica que la web)
 * y lo grave sin resolver (avería/accidente), aunque sea más antiguo. Si algo falla, vacío (no tumba el resumen).
 */
async function actividadCentral(sb: ReturnType<typeof clienteAdmin>, ahora: Date,
  conductores: { id: string; nombre: string; telefono: string | null }[], posiciones: { conductor_id: string; lat: number; lng: number }[]) {
  try {
    const desde = new Date(ahora.getTime() - HORAS_ACTIVIDAD * 3600_000);
    const d = desde.toISOString();
    const [ev, inc, rev, jor, veh, cie, alh] = await Promise.all([
      sb.from("eventos_servicio").select("id,servicio_id,tipo,motivo,creado_en,actor_id").gte("creado_en", d).order("creado_en", { ascending: false }).limit(150),
      sb.from("incidencias").select("id,conductor_id,servicio_id,tipo,descripcion,lat,lng,creado_en,resuelta,zonas")
        .or(`creado_en.gte.${d},and(resuelta.is.false,tipo.in.(${TIPOS_GRAVES.join(",")}))`).order("creado_en", { ascending: false }).limit(60),
      sb.from("checklist_revisiones").select("id,conductor_id,vehiculo_id,con_fallos,observaciones,creado_en").gte("creado_en", d).order("creado_en", { ascending: false }).limit(60),
      sb.from("jornadas").select("id,conductor_id,inicio,fin,pendientes_cierre").or(`inicio.gte.${d},fin.gte.${d}`).order("inicio", { ascending: false }).limit(60),
      sb.from("vehiculos").select("id,matricula"),
      sb.from("cierres_jornada").select("id,conductor_id,vehiculo_id,zonas,tecnico,combustible,comentario,gravedad,creado_en,visto")
        .or(`creado_en.gte.${d},and(gravedad.eq.grave,visto.is.false)`).order("creado_en", { ascending: false }).limit(60),
      sb.from("alertas_horario").select("id,tipo,conductor_id,servicio_id,texto,creado_en,resuelta_en").gte("creado_en", d).order("creado_en", { ascending: false }).limit(60),
    ]);
    const f = [ev, inc, rev, jor, veh, cie].find((x) => x.error);
    if (f?.error) throw new Error(f.error.message);
    const ids = [...new Set([...(ev.data ?? []).map((e) => e.servicio_id), ...(inc.data ?? []).map((i) => i.servicio_id)])].filter((x): x is string => !!x);
    const { data: servs } = ids.length ? await sb.from("servicios").select(`${CAMPOS_ACT},es_prueba`).in("id", ids.slice(0, 200)) : { data: [] };
    const filas = (servs ?? []) as (ServicioAct & { es_prueba: boolean })[];
    const r = construirActividad({
      // Alertas de horario: si la tabla falla (servidor sin migrar), simplemente sin ellas.
      alertasHorario: alh.error ? [] : alh.data ?? [],
      eventos: ev.data ?? [], incidencias: inc.data ?? [], revisiones: rev.data ?? [], jornadas: jor.data ?? [], cierres: (cie.data ?? []) as CierreAct[],
      servicios: filas.filter((x) => !x.es_prueba), ocultos: filas.filter((x) => x.es_prueba).map((x) => x.id),
      conductores, posiciones, vehiculos: veh.data ?? [], desde,
    });
    // `avisos`: CARGA/DESCARGA lejos del punto y jornadas cerradas con pendientes (con posición y teléfono).
    return { actividad: r.movimientos, graves: r.graves, avisos: r.avisos };
  } catch (e) {
    console.error("[central] actividad:", e instanceof Error ? e.message : e);
    return { actividad: [], graves: [], avisos: [] };
  }
}
