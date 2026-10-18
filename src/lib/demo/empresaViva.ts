import "server-only";
import type { clienteAdmin } from "@/lib/supabase/admin";
import { NOTA_DEMO, LUGARES_DEMO, MOTIVO_SIMULADO, aparcamiento } from "@/lib/demo/datosDemo";
import { decisionJornada, reservasEntre, variacion, type EstadoConductorDemo, type ReservaDemo, type TurnoDemo } from "@/lib/demo/empresaDemo";
import { longitudKm, rutaEntre } from "@/lib/demo/movimiento";
import { cargarHorarios } from "@/lib/central/disponibilidad";
import { ejecutarAccionOperador, sugerenciasPara } from "@/lib/central/operaciones";
import { guardarRevision, registrarCierre } from "@/lib/conductor/modulos";
import { intervalosDelDia, vehiculoDelTurno, type HorarioConductor } from "@/lib/dominio/horarios";
import { diaMadrid } from "@/lib/dominio/geo";
import { sumarDias, madridAUtc } from "@/lib/dominio/dias";

/**
 * La empresa de demo funcionando sola durante la evaluación (servidor): entran reservas, la central asigna lo que se
 * acerca (o lo subcontrata si no hay nadie libre) y los conductores fichan, hacen su pausa y se desfichan con la hoja de
 * cierre. Los pasos de cada servicio y los coches por carretera los sigue haciendo demoViva. Solo filas de demo.
 */
type Sb = ReturnType<typeof clienteAdmin>;
const MIN = 60_000, H = 60 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();
const L = LUGARES_DEMO;

/** Ventana de reservas futuras que se van generando (las que «ya se han hecho» a esta hora). */
const HORIZONTE_MS = 72 * H;
/** La central asigna lo que empieza en las próximas 4 h; lo de más adelante queda pendiente para quien pruebe la app. */
const ASIGNA_ANTES_MS = 4 * H;
/** Sin nadie libre a menos de 75 min de la recogida: lo hace una empresa colaboradora. */
const SUBCONTRATA_ANTES_MS = 75 * MIN;

/** Quien prueba la app ha archivado hace poco: se respeta el panel vacío (no entran reservas nuevas durante 3 h). */
async function archivadoReciente(sb: Sb, ahora: number): Promise<boolean> {
  const { data } = await sb.from("archivo_lotes").select("creado_en").is("restaurado_en", null)
    .gte("creado_en", iso(ahora - 3 * H)).limit(1);
  return !!data?.length;
}

function filaReserva(x: ReservaDemo, ahora: number) {
  const o = L[x.origen], d = L[x.destino];
  const reciente = ahora - x.creadaEn < 2 * H; // las de las últimas 2 h salen como «reserva nueva» en las alertas
  return {
    cliente_nombre: x.cliente_nombre, cliente_apellidos: x.cliente_apellidos, cliente_email: x.cliente_email, cliente_telefono: x.cliente_telefono,
    origen_texto: o.t, origen_lat: o.lat, origen_lng: o.lng, destino_texto: d.t, destino_lat: d.lat, destino_lng: d.lng,
    fecha_hora_recogida: iso(x.recogida), pasajeros: x.pasajeros, maletas: x.maletas, tipo_vehiculo_pedido: x.tipo_vehiculo_pedido,
    numero_vuelo: x.numero_vuelo, notas: NOTA_DEMO, origen_pedido: x.origen_pedido, duracion_estimada_min: x.duracion_estimada_min,
    estado: "pendiente", es_prueba: false, subcontratar: false, plazo_respuesta_min: 15,
    incidencia_vista: !reciente, ultima_incidencia: reciente ? "nuevo" : null, creado_en: iso(x.creadaEn),
  };
}

/** Correos (claves de franja) que ya existen, también ocultos o archivados: nunca se duplica una reserva. */
async function correosExistentes(sb: Sb, correos: string[]): Promise<Set<string>> {
  const ya = new Set<string>();
  for (let i = 0; i < correos.length; i += 200) {
    const { data, error } = await sb.from("servicios").select("cliente_email").in("cliente_email", correos.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) ya.add(r.cliente_email as string);
  }
  return ya;
}

/** Inserta las reservas que «ya han entrado» y aún no están (con su evento «creado» a su hora). Devuelve cuántas. */
export async function reservasNuevas(sb: Sb, ahora: number, forzar = false): Promise<number> {
  if (!forzar && await archivadoReciente(sb, ahora)) return 0;
  const plan = reservasEntre(ahora + 45 * MIN, ahora + HORIZONTE_MS, ahora);
  if (!plan.length) return 0;
  const ya = await correosExistentes(sb, plan.map((x) => x.cliente_email));
  const nuevas = plan.filter((x) => !ya.has(x.cliente_email));
  if (!nuevas.length) return 0;
  const { data, error } = await sb.from("servicios").insert(nuevas.map((x) => filaReserva(x, ahora))).select("id,creado_en");
  if (error) throw new Error(error.message);
  const ev = (data ?? []).map((r) => ({ servicio_id: r.id as string, tipo: "creado", actor_id: null, creado_en: r.creado_en as string }));
  if (ev.length) await sb.from("eventos_servicio").insert(ev);
  return ev.length;
}

async function conductoresDemo(sb: Sb) {
  const { data, error } = await sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").eq("rol", "conductor").order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, habitual: (p.vehiculo_habitual_id as string | null) ?? null }));
}
async function operadorCentral(sb: Sb): Promise<string | null> {
  const { data } = await sb.from("perfiles").select("id").eq("rol", "operador").order("nombre").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * La central (automática) con lo que se acerca: asigna al primer conductor apto (como haría el operador con la sugerencia);
 * sin nadie libre y a poco de la hora, lo subcontrata. `reales`: conductores con GPS real (un móvil): no se les asigna.
 */
export async function centralAutomatica(sb: Sb, ahora: number, reales: Set<string>): Promise<number> {
  const { data, error } = await sb.from("servicios")
    .select("id,estado,fecha_hora_recogida,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng,origen_texto,destino_texto,pasajeros,maletas,tipo_vehiculo_pedido,subcontratar")
    .eq("notas", NOTA_DEMO).eq("es_prueba", false).eq("estado", "pendiente")
    .gte("fecha_hora_recogida", iso(ahora - 3 * H)).lte("fecha_hora_recogida", iso(ahora + ASIGNA_ANTES_MS)).order("fecha_hora_recogida").limit(4);
  if (error) throw new Error(error.message);
  if (!data?.length) return 0;
  const op = await operadorCentral(sb);
  if (!op) return 0;
  let n = 0;
  for (const s of data) {
    const falta = Date.parse(s.fecha_hora_recogida as string) - ahora;
    const sug = falta > -10 * MIN ? await sugerenciasPara(sb, s as Parameters<typeof sugerenciasPara>[1]) : [];
    const apto = sug.find((g) => g.apto && !reales.has(g.conductorId));
    const p = apto
      ? { idAccion: crypto.randomUUID(), servicioId: s.id as string, accion: "asignar" as const, conductorId: apto.conductorId, estadoEsperado: "pendiente" as const }
      : falta < SUBCONTRATA_ANTES_MS
        ? { idAccion: crypto.randomUUID(), servicioId: s.id as string, accion: "subcontratar" as const, estadoEsperado: "pendiente" as const,
          motivo: "Sin conductor libre a esa hora: lo hace una empresa colaboradora" }
        : null;
    if (!p) continue;
    // Sin push: los avisos de la demo no van al móvil de nadie.
    const { r } = await ejecutarAccionOperador(op, p);
    if (r.ok) n++;
  }
  return n;
}

// ── Jornadas de los conductores de demo ──

/** Turno que toca ahora (o que acaba de terminar, para desficharse) de un conductor. */
function turnoActual(h: HorarioConductor | undefined, ahora: number): TurnoDemo | null {
  const hoy = diaMadrid(new Date(ahora));
  const ivs = [...(intervalosDelDia(h, sumarDias(hoy, -1)) ?? []), ...(intervalosDelDia(h, hoy) ?? [])];
  // El más reciente que ya ha empezado (con 10 min de margen para fichar antes) y no acabó hace más de 4 h.
  const cand = ivs.filter((i) => i.inicio - 10 * MIN <= ahora && ahora < i.fin + 4 * H).sort((a, b) => b.inicio - a.inicio);
  return cand[0] ? { inicio: cand[0].inicio, fin: cand[0].fin } : null;
}

const RESPUESTAS_OK = async (sb: Sb) => {
  const { data } = await sb.from("checklist_items").select("id,activo");
  return Object.fromEntries((data ?? []).filter((i) => i.activo !== false).map((i) => [i.id as string, "ok"]));
};
const COMBUSTIBLE_FIN = ["3_4", "1_2", "3_4", "lleno", "1_2", "1_4"] as const;

/**
 * Cada conductor de demo con su jornada: ficha (y revisa el coche) al empezar el turno, hace una pausa a media jornada,
 * y al acabar presenta la hoja de cierre (km del día, combustible) y se queda «fuera de servicio».
 * `saltar`: conductores con GPS real o que una persona está manejando ahora (no se les toca la jornada).
 * Devuelve quién está de servicio (jornada abierta) para que solo esos coches manden posición.
 */
export async function jornadasDemo(sb: Sb, ahora: number, saltar: Set<string>): Promise<Set<string>> {
  const conductores = await conductoresDemo(sb);
  const ids = conductores.map((c) => c.id);
  const hoy = diaMadrid(new Date(ahora));
  const [{ horarios }, { data: abiertas }, { data: recientes }, { data: servs }] = await Promise.all([
    cargarHorarios(sb, sumarDias(hoy, -1), hoy),
    sb.from("jornadas").select("id,conductor_id,inicio,pausas(id,inicio,fin)").in("conductor_id", ids).is("fin", null),
    sb.from("jornadas").select("conductor_id,fin").in("conductor_id", ids).gte("fin", iso(ahora - 20 * H)),
    sb.from("servicios").select("conductor_id,estado,fecha_hora_recogida").in("conductor_id", ids).eq("es_prueba", false)
      .in("estado", ["asignado", "aceptado", "en_camino", "recogido"]).gte("fecha_hora_recogida", iso(ahora - 12 * H)).lte("fecha_hora_recogida", iso(ahora + 12 * H)),
  ]);
  const deServicio = new Set<string>();
  for (const c of conductores) {
    const ab = (abiertas ?? []).find((j) => j.conductor_id === c.id) as { id: string; inicio: string; pausas: { id: string; inicio: string; fin: string | null }[] } | undefined;
    if (ab) deServicio.add(c.id);
    if (saltar.has(c.id)) continue;
    const turno = turnoActual(horarios.get(c.id), ahora);
    const suyos = (servs ?? []).filter((s) => s.conductor_id === c.id);
    const futuros = suyos.filter((s) => s.estado === "asignado" || s.estado === "aceptado").map((s) => Date.parse(s.fecha_hora_recogida as string)).filter((t) => t > ahora - 15 * MIN);
    const e: EstadoConductorDemo = {
      turno,
      abierta: ab ? { inicio: Date.parse(ab.inicio), enPausaDesde: ab.pausas.find((p) => !p.fin) ? Date.parse(ab.pausas.find((p) => !p.fin)!.inicio) : null, pausas: ab.pausas.length } : null,
      ocupado: suyos.some((s) => s.estado === "en_camino" || s.estado === "recogido"),
      proximaRecogida: futuros.length ? Math.min(...futuros) : null,
      cerroEsteTurno: !!turno && (recientes ?? []).some((j) => j.conductor_id === c.id && Date.parse(j.fin as string) >= turno.inicio - 30 * MIN),
    };
    const d = decisionJornada(c.id, e, ahora);
    if (!d) continue;
    const vehiculo = vehiculoDelTurno(horarios.get(c.id), diaMadrid(new Date(turno?.inicio ?? ahora))) ?? c.habitual;
    try {
      if (d === "fichar") {
        // Si la simulación llega con el turno ya empezado (servidor reiniciado), la entrada es la de su turno, no la de ahora.
        const inicio = turno && ahora - turno.inicio > 20 * MIN ? turno.inicio - 8 * MIN + variacion(c.id, turno.inicio, 8) : ahora;
        const { error } = await sb.from("jornadas").insert({ conductor_id: c.id, inicio: iso(inicio) });
        if (error && error.code !== "23505") throw new Error(error.message);
        if (vehiculo) await guardarRevision(sb, c.id, { vehiculo_id: vehiculo, respuestas: await RESPUESTAS_OK(sb), observaciones: "" });
        deServicio.add(c.id);
        const base = aparcamiento(ids.indexOf(c.id));
        await sb.from("posiciones").insert({ conductor_id: c.id, lat: base.lat, lng: base.lng, velocidad: 0, registrado_en: iso(ahora), simulada: true });
      } else if (d === "pausa") {
        await sb.from("pausas").insert({ jornada_id: ab!.id, inicio: iso(ahora) });
      } else if (d === "reanudar") {
        await sb.from("pausas").update({ fin: iso(ahora) }).eq("jornada_id", ab!.id).is("fin", null);
      } else if (d === "desfichar" && vehiculo) {
        const r = await registrarCierre(sb, c.id, {
          vehiculo_id: vehiculo, zonas: [], combustible: COMBUSTIBLE_FIN[variacion(c.id, Date.parse(ab!.inicio), COMBUSTIBLE_FIN.length - 1) / MIN],
          tecnico: { neumaticos: "ok", aceite: "ok", refrigerante: "ok", luces: "ok", testigos_cuadro: "ok", otra_averia: "ok" },
          km: await kmFinJornada(sb, c.id, vehiculo, Date.parse(ab!.inicio)), comentario: "",
        });
        if (!r.ok) throw new Error(r.error);
        deServicio.delete(c.id);
        // Como el interruptor «En servicio» de la app: en el mapa sale «Fuera de servicio».
        await sb.from("posicion_actual").update({ en_servicio: false }).eq("conductor_id", c.id);
      }
    } catch (err) {
      console.error(`[demo] jornada ${d}:`, err instanceof Error ? err.message : err);
    }
  }
  // Sin jornada abierta (ni GPS real), el coche no está «en servicio» aunque algo antiguo lo dejara así.
  const enMarcha = new Set((servs ?? []).filter((x) => x.estado === "en_camino" || x.estado === "recogido").map((x) => x.conductor_id as string));
  const fuera = ids.filter((id) => !deServicio.has(id) && !saltar.has(id) && !enMarcha.has(id));
  if (fuera.length) await sb.from("posicion_actual").update({ en_servicio: false }).in("conductor_id", fuera).eq("en_servicio", true);
  return deServicio;
}

/** Km del coche al cerrar: los que tenía + lo recorrido en sus servicios de la jornada (ida a recoger y vuelta incluidas). */
async function kmFinJornada(sb: Sb, conductorId: string, vehiculoId: string, desde: number): Promise<number | null> {
  const [{ data: v }, { data: hechos }] = await Promise.all([
    sb.from("vehiculos").select("km_actuales").eq("id", vehiculoId).maybeSingle(),
    sb.from("servicios").select("origen_lat,origen_lng,destino_lat,destino_lng").eq("conductor_id", conductorId).eq("estado", "completado")
      .gte("fecha_hora_recogida", iso(desde - 30 * MIN)),
  ]);
  if (v?.km_actuales == null) return null;
  const km = (hechos ?? []).reduce((t, s) => s.origen_lat == null || s.destino_lat == null ? t
    : t + longitudKm(rutaEntre({ lat: s.origen_lat, lng: s.origen_lng }, { lat: s.destino_lat, lng: s.destino_lng })) * 1.7, 0);
  return Math.round((v.km_actuales as number) + Math.max(8, km));
}

// ── Historial de la última semana (una sola vez) ──

/**
 * Si no hay historial de demo, genera el de los últimos días como si la empresa llevara tiempo funcionando: servicios
 * hechos (con sus pasos) por el conductor de turno o subcontratados, y las jornadas con su pausa. Devuelve cuántos servicios.
 */
export async function historialDemo(sb: Sb, ahora: number, dias = 7): Promise<number> {
  const desde = Date.parse(madridAUtc(sumarDias(diaMadrid(new Date(ahora)), -dias), "00:00"));
  const hasta = ahora - 40 * MIN;
  const { count } = await sb.from("servicios").select("id", { count: "exact", head: true }).eq("notas", NOTA_DEMO).eq("es_prueba", false)
    .gte("fecha_hora_recogida", iso(desde)).lt("fecha_hora_recogida", iso(hasta));
  if ((count ?? 0) > 0) return 0;
  // Si alguien archivó (y no lo ha deshecho), no se rehace el historial: «Deshacer» lo duplicaría.
  const { data: archivo } = await sb.from("archivo_lotes").select("id").is("restaurado_en", null).limit(1);
  if (archivo?.length) return 0;
  const conductores = await conductoresDemo(sb);
  const { horarios } = await cargarHorarios(sb, sumarDias(diaMadrid(new Date(desde)), -1), diaMadrid(new Date(ahora)));
  const op = await operadorCentral(sb);

  // Jornadas de los turnos ya terminados (las de prueba de esos días se sustituyen).
  const ids = conductores.map((c) => c.id);
  await sb.from("jornadas").delete().in("conductor_id", ids).gte("inicio", iso(desde)).not("fin", "is", null);
  const jornadas: { conductor_id: string; inicio: string; fin: string }[] = [];
  const pausas: { conductor: string; inicio: string; fin: string }[] = [];
  const turnos = new Map<string, TurnoDemo[]>();
  for (const c of conductores) {
    const lista: TurnoDemo[] = [];
    for (let d = 0; d <= dias; d++) {
      for (const iv of intervalosDelDia(horarios.get(c.id), sumarDias(diaMadrid(new Date(desde)), d)) ?? []) {
        if (iv.inicio < desde || lista.some((x) => x.inicio === iv.inicio)) continue;
        lista.push({ inicio: iv.inicio, fin: iv.fin });
        if (iv.fin + 15 * MIN > ahora) continue; // el turno en curso lo ficha la simulación en vivo
        const ini = iv.inicio - 8 * MIN + variacion(c.id, iv.inicio, 8), fin = iv.fin + variacion(c.id, iv.fin, 10);
        jornadas.push({ conductor_id: c.id, inicio: iso(ini), fin: iso(fin) });
        if (iv.fin - iv.inicio >= 6 * H) {
          const p = iv.inicio + (iv.fin - iv.inicio) * 0.5;
          pausas.push({ conductor: c.id, inicio: iso(p), fin: iso(p + 20 * MIN + variacion(c.id, iv.inicio, 10)) });
        }
      }
    }
    turnos.set(c.id, lista);
  }
  if (jornadas.length) {
    const { data: js, error } = await sb.from("jornadas").insert(jornadas).select("id,conductor_id,inicio,fin");
    if (error) throw new Error(error.message);
    const filasPausa = pausas.flatMap((p) => {
      const j = (js ?? []).find((x) => x.conductor_id === p.conductor && x.inicio <= p.inicio && (x.fin as string) >= p.fin);
      return j ? [{ jornada_id: j.id as string, inicio: p.inicio, fin: p.fin }] : [];
    });
    if (filasPausa.length) await sb.from("pausas").insert(filasPausa);
  }

  // Servicios ya hechos: al conductor de turno libre (sale 20 min antes) o, si no hay, subcontratado.
  const ocupadoHasta = new Map<string, number>();
  const filas: Record<string, unknown>[] = [];
  const pasos: { i: number; tipo: string; actor: string | null; motivo: string | null; t: number }[] = [];
  for (const x of reservasEntre(desde, hasta, ahora)) {
    const fin = x.recogida + 2 * MIN + x.duracion_estimada_min * MIN;
    // Puede alargar un poco el turno para acabar (como en la realidad); tras Barcelona tarda una hora en volver.
    const c = conductores.find((k) => (turnos.get(k.id) ?? []).some((t) => t.inicio <= x.recogida - 20 * MIN && fin <= t.fin + 45 * MIN)
      && (ocupadoHasta.get(k.id) ?? 0) <= x.recogida - 20 * MIN);
    const i = filas.length;
    const asignado = Math.max(x.creadaEn + 10 * MIN, x.recogida - 4 * H);
    filas.push({ ...filaReserva(x, ahora), incidencia_vista: true, ultima_incidencia: null,
      estado: c ? "completado" : "subcontratado", conductor_id: c?.id ?? null, asignado_en: c ? iso(asignado) : null,
      vehiculo_id: c ? vehiculoDelTurno(horarios.get(c.id), diaMadrid(new Date(x.recogida))) ?? c.habitual : null });
    pasos.push({ i, tipo: "creado", actor: null, motivo: null, t: x.creadaEn });
    if (!c) { pasos.push({ i, tipo: "subcontratado", actor: op, motivo: "Sin conductor libre a esa hora: lo hace una empresa colaboradora", t: Math.max(x.creadaEn + 5 * MIN, x.recogida - SUBCONTRATA_ANTES_MS) }); continue; }
    ocupadoHasta.set(c.id, fin + (x.origen === "bcn" || x.destino === "bcn" ? 60 : 15) * MIN);
    pasos.push({ i, tipo: "asignado", actor: op, motivo: null, t: asignado }, { i, tipo: "aceptado", actor: c.id, motivo: MOTIVO_SIMULADO, t: asignado + 3 * MIN },
      { i, tipo: "en_camino", actor: c.id, motivo: MOTIVO_SIMULADO, t: x.recogida - 20 * MIN }, { i, tipo: "llegando_recogida", actor: c.id, motivo: MOTIVO_SIMULADO, t: x.recogida - 4 * MIN },
      { i, tipo: "recogido", actor: c.id, motivo: MOTIVO_SIMULADO, t: x.recogida + 2 * MIN }, { i, tipo: "llegando_destino", actor: c.id, motivo: MOTIVO_SIMULADO, t: fin - 4 * MIN },
      { i, tipo: "completado", actor: c.id, motivo: MOTIVO_SIMULADO, t: fin });
  }
  if (!filas.length) return 0;
  const ya = await correosExistentes(sb, filas.map((f) => f.cliente_email as string));
  const keep = filas.map((f, i) => ({ f, i })).filter(({ f }) => !ya.has(f.cliente_email as string));
  if (!keep.length) return 0;
  const { data: ins, error } = await sb.from("servicios").insert(keep.map(({ f }) => f)).select("id,cliente_email");
  if (error) throw new Error(error.message);
  const idDe = new Map(keep.map(({ f, i }) => [i, (ins ?? []).find((r) => r.cliente_email === f.cliente_email)?.id as string | undefined]));
  const ev = pasos.flatMap((p) => { const id = idDe.get(p.i); return id ? [{ servicio_id: id, tipo: p.tipo, actor_id: p.actor, motivo: p.motivo, creado_en: iso(p.t) }] : []; });
  for (let k = 0; k < ev.length; k += 500) await sb.from("eventos_servicio").insert(ev.slice(k, k + 500));
  return keep.length;
}

/** Demo a la vista: servicios de demo de hoy en adelante. */
export async function demoEnMarcha(sb: Sb, ahora: number): Promise<number> {
  const { count } = await sb.from("servicios").select("id", { count: "exact", head: true }).eq("notas", NOTA_DEMO).eq("es_prueba", false)
    .gte("fecha_hora_recogida", iso(ahora - 6 * H));
  return count ?? 0;
}

/** Botón «Cargar datos de demo»: pone la empresa en marcha ya (historial si falta, reservas aunque se haya archivado y la central). */
export async function arrancarDemo(sb: Sb, ahora: number, reales: Set<string> = new Set()): Promise<{ historial: number; reservas: number; asignadas: number }> {
  const historial = await historialDemo(sb, ahora);
  const reservas = await reservasNuevas(sb, ahora, true);
  const asignadas = await centralAutomatica(sb, ahora, reales);
  return { historial, reservas, asignadas };
}
