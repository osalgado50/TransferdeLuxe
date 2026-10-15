import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";
import { enviarACentral } from "@/lib/push";
import type { MensajeCentral } from "@/lib/dominio/lotePush";
import { esperaBackoff } from "@/lib/dominio/reintento";
import { actualizarRecorridos } from "@/lib/servicios/recorridos";
import { construirAvisos, type CierreAviso, type EventoAviso, type IncidenciaAviso, type RevisionAviso, type ServicioAviso } from "@/lib/dominio/avisosCentral";
import { evaluarAnomalia, motivoAnomalia, posicionEnEvento, UMBRAL_ANOMALIA_DEFECTO_M, VENTANA_POSICION_MS, type ServicioAnomalia } from "@/lib/dominio/anomalias";
import { ESTADOS_PENDIENTE_HOY, horaCorta, pendientesHoy } from "@/lib/dominio/finJornada";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import { cargarHorarios } from "@/lib/central/disponibilidad";
import { alertaFinTurno, alertaFueraHorario, alertaHorarioVigente, alertaSinJornada, type AlertaHorario, type ServicioEnCurso } from "@/lib/dominio/horarios";
import { alertaJornadaLarga, HORAS_JORNADA_LARGA } from "@/lib/dominio/jornadaLarga";
import { ausenciaEn, type Ausencia } from "@/lib/dominio/ausencias";
import { aPlan, finDe, type FilaPlan } from "@/lib/dominio/planificacion";
import { lugarCorto } from "@/lib/dominio/avisosCentral";
import { leerModulos } from "@/lib/dominio/modulos";

/** Pruebas automáticas (scripts/prueba-*.mjs): sin push a la central aunque aún no estén marcadas es_prueba. */
const PREFIJO_PRUEBA = "PRUEBA AUTOMÁTICA";
const esDePrueba = (s: { es_prueba?: boolean | null; notas?: string | null }) => !!s.es_prueba || (s.notas ?? "").startsWith(PREFIJO_PRUEBA);

const LIMITE = 50;

/** Una pasada: lee lo nuevo desde el cursor (vigilante_push), avisa a la central y avanza el cursor. */
export async function vigilarUnaVez(): Promise<number> {
  const sb = clienteAdmin();
  const { data: c, error } = await sb.from("vigilante_push").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`cursor: ${error.message}`); // Supabase caído → el arranque aplica backoff
  if (!c) return 0;
  // Retrasos en la recogida (idempotente: índice único parcial). Si falla, el pg_cron de cada minuto lo cubre.
  const det = await sb.rpc("detectar_retrasos_recogida");
  if (det.error) console.error("[vigilante] retrasos:", det.error.message);
  await pasadaRecorridos(sb);
  // Avisos de horario de esta pasada: salen junto con los demás, en un solo envío (tokens leídos una vez).
  const deHorario: MensajeCentral[] = [];
  await pasadaHorarios(sb, Date.now(), false, deHorario);
  const jornadasPendientes = await pasadaJornadasCerradas(sb);
  const [{ data: ev }, { data: inc }, { data: rev }, { data: cie }] = await Promise.all([
    sb.from("eventos_servicio").select("id,servicio_id,tipo,actor_id,motivo,creado_en").gt("id", c.ultimo_evento_id).order("id").limit(LIMITE),
    sb.from("incidencias").select("id,conductor_id,servicio_id,tipo,descripcion,lat,lng,creado_en,zonas").gt("creado_en", c.ultima_incidencia_en).order("creado_en").limit(LIMITE),
    sb.from("checklist_revisiones").select("conductor_id,vehiculo_id,con_fallos,creado_en").gt("creado_en", c.ultima_revision_en).order("creado_en").limit(LIMITE),
    c.ultimo_cierre_en
      ? sb.from("cierres_jornada").select("id,conductor_id,vehiculo_id,zonas,tecnico,combustible,comentario,gravedad,creado_en").gt("creado_en", c.ultimo_cierre_en).order("creado_en").limit(LIMITE)
      : Promise.resolve({ data: [] }),
  ]);
  const eventos = (ev ?? []) as EventoAviso[];
  const incidencias = (inc ?? []) as (IncidenciaAviso & { creado_en: string })[];
  const revisiones = (rev ?? []) as (RevisionAviso & { con_fallos: boolean; creado_en: string })[];
  const cierres = (cie ?? []) as (CierreAviso & { creado_en: string })[];
  if (!eventos.length && !incidencias.length && !revisiones.length && !cierres.length && !jornadasPendientes.length) {
    await enviarACentral(deHorario, { sb });
    return 0;
  }

  const idsServ = [...new Set([...eventos.map((e) => e.servicio_id), ...incidencias.map((i) => i.servicio_id).filter((x): x is string => !!x)])];
  const { data: servs } = idsServ.length
    ? await sb.from("servicios").select("id,origen_texto,destino_texto,fecha_hora_recogida,origen_pedido,conductor_id,es_prueba,notas,origen_lat,origen_lng,destino_lat,destino_lng").in("id", idsServ)
    : { data: [] };
  const porId = new Map(((servs ?? []) as ServicioAviso[]).map((s) => [s.id, s]));
  // CARGA / DESCARGA lejos del punto: inserta el evento de anomalía (el aviso sale en la pasada siguiente, por el cursor).
  await pasadaAnomalias(sb, eventos as (EventoAviso & { creado_en: string })[], porId as unknown as Map<string, ServicioAnomalia>);
  // Pruebas automáticas (es_prueba o notas «PRUEBA AUTOMÁTICA…»): sin push a la central (el cursor avanza igual).
  const prueba = new Set(((servs ?? []) as { id: string; es_prueba?: boolean; notas?: string | null }[]).filter(esDePrueba).map((s) => s.id));
  // Retraso en la recogida: el evento no tiene actor; se nombra (y se sitúa) al conductor asignado.
  const tarde = eventos.filter((e) => e.tipo === "retraso_recogida").map((e) => porId.get(e.servicio_id)?.conductor_id).filter((x): x is string => !!x);
  const idsPers = [...new Set([...eventos.map((e) => e.actor_id), ...tarde, ...jornadasPendientes.map((j) => j.conductor_id), ...incidencias.map((i) => i.conductor_id), ...revisiones.map((r) => r.conductor_id), ...cierres.map((x) => x.conductor_id)].filter((x): x is string => !!x))];
  const idsVeh = [...new Set([...revisiones.map((r) => r.vehiculo_id), ...cierres.map((x) => x.vehiculo_id)])];
  // Zona de las incidencias sin coordenadas y de los retrasos: última posición del conductor.
  const sinCoord = [...new Set([...incidencias.filter((i) => i.lat == null || i.lng == null).map((i) => i.conductor_id), ...tarde])];
  const [{ data: pers }, { data: vehs }, { data: poss }] = await Promise.all([
    idsPers.length ? sb.from("perfiles").select("id,nombre").in("id", idsPers) : Promise.resolve({ data: [] }),
    idsVeh.length ? sb.from("vehiculos").select("id,matricula").in("id", idsVeh) : Promise.resolve({ data: [] }),
    sinCoord.length ? sb.from("posicion_actual").select("conductor_id,lat,lng").in("conductor_id", sinCoord) : Promise.resolve({ data: [] }),
  ]);
  const avisos = construirAvisos({
    eventos: eventos.filter((e) => !prueba.has(e.servicio_id)),
    incidencias: incidencias.filter((i) => (!i.servicio_id || !prueba.has(i.servicio_id)) && !i.descripcion?.startsWith("PRUEBA AUTOMÁTICA")),
    revisiones: revisiones.filter((r) => r.con_fallos),
    cierres: cierres.filter((x) => !x.comentario?.startsWith("PRUEBA AUTOMÁTICA")), // pruebas automáticas: sin push
    servicios: porId,
    nombres: new Map(((pers ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])),
    matriculas: new Map(((vehs ?? []) as { id: string; matricula: string }[]).map((v) => [v.id, v.matricula])),
    posiciones: new Map(((poss ?? []) as { conductor_id: string; lat: number; lng: number }[]).map((p) => [p.conductor_id, p])),
    jornadasPendientes,
  });
  // El cursor avanza antes de enviar: ante un fallo se pierde un aviso, nunca se duplica. Si el cursor NO se guarda,
  // no se envían (la pasada siguiente los volverá a leer y entonces sí); los de horario sí, porque no dependen del cursor.
  const { error: errCursor } = await sb.from("vigilante_push").update({
    ultimo_evento_id: eventos.at(-1)?.id ?? c.ultimo_evento_id,
    ultima_incidencia_en: incidencias.at(-1)?.creado_en ?? c.ultima_incidencia_en,
    ultima_revision_en: revisiones.at(-1)?.creado_en ?? c.ultima_revision_en,
    ...(c.ultimo_cierre_en ? { ultimo_cierre_en: cierres.at(-1)?.creado_en ?? c.ultimo_cierre_en } : {}),
    actualizado_en: new Date().toISOString(),
  }).eq("id", 1);
  if (errCursor) {
    await enviarACentral(deHorario, { sb });
    throw new Error(`cursor no guardado (${avisos.length} aviso(s) sin enviar): ${errCursor.message}`);
  }
  await enviarACentral([...deHorario, ...avisos.map((a) => ({ titulo: a.titulo, cuerpo: a.cuerpo, data: a.data }))], { sb });
  return avisos.length;
}

/**
 * CARGA («recogido») o DESCARGA («completado») registrada lejos del origen/destino: compara la posición del conductor en
 * ese momento (posiciones ±2 min o la actual reciente) con el punto; si supera ajustes.umbral_anomalia_m inserta UNA vez
 * el evento «anomalia_carga»/«anomalia_descarga» (índice único). Sin coordenadas o sin GPS: nada. Nunca rompe la pasada.
 */
async function pasadaAnomalias(sb: ReturnType<typeof clienteAdmin>, eventos: (EventoAviso & { creado_en: string })[], servicios: Map<string, ServicioAnomalia>): Promise<void> {
  const objetivo = eventos.filter((e) => (e.tipo === "recogido" || e.tipo === "completado") && e.actor_id && servicios.has(e.servicio_id));
  if (!objetivo.length) return;
  try {
    const { data: aj } = await sb.from("ajustes").select("umbral_anomalia_m").eq("id", 1).maybeSingle();
    const umbral = (aj as { umbral_anomalia_m?: number } | null)?.umbral_anomalia_m ?? UMBRAL_ANOMALIA_DEFECTO_M;
    for (const e of objetivo) {
      const t = Date.parse(e.creado_en);
      const [{ data: pos }, { data: act }] = await Promise.all([
        sb.from("posiciones").select("lat,lng,registrado_en").eq("conductor_id", e.actor_id!)
          .gte("registrado_en", new Date(t - VENTANA_POSICION_MS).toISOString()).lte("registrado_en", new Date(t + VENTANA_POSICION_MS).toISOString())
          .order("registrado_en", { ascending: false }).limit(60),
        sb.from("posicion_actual").select("lat,lng,registrado_en").eq("conductor_id", e.actor_id!).maybeSingle(),
      ]);
      const a = evaluarAnomalia(e.tipo, servicios.get(e.servicio_id)!, posicionEnEvento(pos ?? [], e.creado_en, act ?? null), umbral);
      if (!a) continue;
      const { error } = await sb.from("eventos_servicio").insert({ servicio_id: e.servicio_id, tipo: a.tipo, actor_id: e.actor_id, motivo: motivoAnomalia(a) });
      if (error && error.code !== "23505") console.error("[vigilante] anomalía:", error.message);
      else if (!error) console.log(`[vigilante] ${a.tipo} a ${a.distanciaM} m · servicio ${e.servicio_id}`);
    }
  } catch (err) {
    console.error("[vigilante] anomalías:", err instanceof Error ? err.message : err);
  }
}

/**
 * Red de seguridad del fin de jornada (también para apps antiguas que no preguntan): jornadas cerradas hace 2–60 min y aún
 * sin revisar → servicios de HOY posteriores al cierre sin devolver (asignado/aceptado/en camino). Se revisa UNA vez por
 * jornada (marca atómica `pendientes_revisada_en`); no devuelve nada automáticamente, solo avisa a la central.
 * Los 2 min de gracia dejan llegar las devoluciones de la cola offline enviadas justo antes de cerrar.
 */
async function pasadaJornadasCerradas(sb: ReturnType<typeof clienteAdmin>): Promise<{ conductor_id: string; horas: string[] }[]> {
  const out: { conductor_id: string; horas: string[] }[] = [];
  try {
    const ahora = Date.now();
    const { data: js, error } = await sb.from("jornadas").select("id,conductor_id,fin").is("pendientes_revisada_en", null).not("fin", "is", null)
      .gte("fin", new Date(ahora - 60 * 60_000).toISOString()).lte("fin", new Date(ahora - 2 * 60_000).toISOString()).order("fin").limit(20);
    if (error) { console.error("[vigilante] jornadas:", error.message); return out; }
    for (const j of (js ?? []) as { id: string; conductor_id: string; fin: string }[]) {
      const { data: marcada } = await sb.from("jornadas").update({ pendientes_revisada_en: new Date().toISOString() })
        .eq("id", j.id).is("pendientes_revisada_en", null).select("id");
      if (!marcada?.length) continue; // otra instancia ya la revisó
      const dia = diaMadrid(j.fin);
      const [{ data: servs }, { data: abierta }] = await Promise.all([
        sb.from("servicios").select("id,estado,fecha_hora_recogida,es_prueba,notas").eq("conductor_id", j.conductor_id)
          .in("estado", [...ESTADOS_PENDIENTE_HOY]).gt("fecha_hora_recogida", j.fin).lt("fecha_hora_recogida", madridAUtc(sumarDias(dia, 1), "00:00")).limit(50),
        sb.from("jornadas").select("id").eq("conductor_id", j.conductor_id).is("fin", null).maybeSingle(),
      ]);
      const pend = pendientesHoy(((servs ?? []) as { id: string; estado: string; fecha_hora_recogida: string; es_prueba: boolean; notas: string | null }[])
        .filter((s) => !esDePrueba(s)), new Date(j.fin));
      // Si ya ha vuelto a abrir jornada, no hay nada desatendido.
      const lista = abierta ? [] : pend.map((s) => ({ id: s.id, hora: horaCorta(s.fecha_hora_recogida) }));
      await sb.from("jornadas").update({ pendientes_cierre: lista }).eq("id", j.id);
      if (lista.length) out.push({ conductor_id: j.conductor_id, horas: lista.map((x) => x.hora) });
    }
  } catch (err) {
    console.error("[vigilante] jornadas:", err instanceof Error ? err.message : err);
  }
  return out;
}

const HORARIOS_CADA_MS = 60_000;
type FilaHorario = FilaPlan & { conductor_id: string; estado: string; es_prueba: boolean; notas: string | null; origen_texto: string; destino_texto: string };

/**
 * Alertas de horario a la central (como mucho una pasada por minuto; una alerta por caso gracias a la clave única de
 * alertas_horario): servicio asignado fuera del horario del conductor, sin iniciar jornada 15 min después del inicio de
 * su tramo y en servicio > 30 min pasado el fin de su turno sin tiempo de volver a la base. Solo conductores con
 * horario. Las pruebas automáticas se registran pero sin push. Nunca rompe la pasada de avisos.
 */
export async function pasadaHorarios(sb: ReturnType<typeof clienteAdmin>, ahora = Date.now(), forzar = false, salida?: MensajeCentral[]): Promise<AlertaHorario[]> {
  const g = globalThis as { __horariosUltima?: number };
  if (!forzar && g.__horariosUltima && ahora - g.__horariosUltima < HORARIOS_CADA_MS) return [];
  g.__horariosUltima = ahora;
  const nuevas: AlertaHorario[] = [];
  // Push de esta pasada: a `salida` (las envía quien llama, en lote) o, si no la hay, al terminar.
  const pend: MensajeCentral[] = salida ?? [];
  try {
    await pasadaJornadasLargas(sb, ahora, pend);
    const hoy = diaMadrid(new Date(ahora));
    const { horarios, base } = await cargarHorarios(sb, sumarDias(hoy, -1), sumarDias(hoy, 3));
    const ids = [...horarios.keys()];
    if (!ids.length) { await resolverAlertasHorario(sb, ahora, () => false); return nuevas; }
    const [{ data: pers }, { data: abiertas }, { data: aus }, { data: servs, error }, { data: aj }] = await Promise.all([
      sb.from("perfiles").select("id,nombre").in("id", ids),
      sb.from("jornadas").select("conductor_id").is("fin", null).in("conductor_id", ids),
      sb.from("ausencias").select("conductor_id,desde,hasta,franja,tipo").in("conductor_id", ids).lte("desde", hoy).gte("hasta", hoy),
      sb.from("servicios").select("id,conductor_id,estado,es_prueba,notas,fecha_hora_recogida,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng,origen_texto,destino_texto")
        .in("conductor_id", ids).in("estado", ["asignado", "aceptado", "en_camino", "recogido"])
        .gte("fecha_hora_recogida", new Date(ahora - 8 * 3600e3).toISOString()).lt("fecha_hora_recogida", new Date(ahora + 48 * 3600e3).toISOString()).limit(1000),
      sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle(),
    ]);
    // Sin el módulo de jornada nadie la inicia: no tiene sentido avisar de «sin iniciar jornada».
    const conJornada = leerModulos(aj?.modulos).jornada;
    if (error) { console.error("[vigilante] horarios:", error.message); return nuevas; }
    const nombre = new Map(((pers ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
    const abierta = new Set(((abiertas ?? []) as { conductor_id: string }[]).map((j) => j.conductor_id));
    const filas = ((servs ?? []) as FilaHorario[]).filter((x) => !x.es_prueba);
    const prueba = new Set(filas.filter((x) => (x.notas ?? "").startsWith(PREFIJO_PRUEBA)).map((x) => x.id));
    const porId = new Map(filas.map((x) => [x.id, x]));
    const candidatas: (AlertaHorario & { conductorId: string })[] = [];
    const enCurso = new Map<string, ServicioEnCurso[]>();
    for (const cid of ids) {
      const h = horarios.get(cid)!;
      const n = nombre.get(cid) ?? "Un conductor";
      const suyos = filas.filter((x) => x.conductor_id === cid);
      const planes = suyos.map((x) => ({ fila: x, plan: aPlan(x) }));
      const agenda = planes.map(({ plan }) => ({ id: plan.id, inicio: plan.inicio.getTime(), fin: finDe(plan).getTime() }));
      for (const { fila, plan } of planes) {
        if ((fila.estado !== "asignado" && fila.estado !== "aceptado") || plan.inicio.getTime() < ahora - 30 * 60_000) continue;
        const a = alertaFueraHorario(n, plan, h, { base, agenda });
        if (a) candidatas.push({ ...a, conductorId: cid });
      }
      const ausente = !!ausenciaEn((aus ?? []) as Ausencia[], cid, new Date(ahora));
      const sj = conJornada ? alertaSinJornada(n, h, ahora, { jornadaAbierta: abierta.has(cid), ausente }) : null;
      if (sj) candidatas.push({ ...sj, conductorId: cid });
      const servicios = planes.map(({ fila, plan }) => ({ id: plan.id, estado: fila.estado, inicio: plan.inicio.getTime(), duracionMin: plan.duracionMin, destino: plan.destino }));
      enCurso.set(cid, servicios);
      const ft = alertaFinTurno(n, h, ahora, { base, servicios });
      if (ft) candidatas.push({ ...ft, conductorId: cid });
    }
    for (const a of candidatas) {
      // ON CONFLICT DO NOTHING: solo vuelve la fila si es nueva (una alerta por caso, también con varias instancias).
      const { data, error: e } = await sb.from("alertas_horario")
        .upsert({ tipo: a.tipo, conductor_id: a.conductorId, servicio_id: a.servicioId ?? null, clave: a.clave, texto: a.texto.slice(0, 300) },
          { onConflict: "tipo,conductor_id,clave", ignoreDuplicates: true })
        .select("id");
      if (e) { console.error("[vigilante] alerta de horario:", e.message); continue; }
      if (!data?.length) continue;
      nuevas.push(a);
      console.log(`[vigilante] horario ${a.tipo} · ${a.clave}`);
      if (a.servicioId && prueba.has(a.servicioId)) continue; // prueba automática: sin push
      const s = a.servicioId ? porId.get(a.servicioId) : undefined;
      const cuerpo = s ? `${lugarCorto(s.origen_texto)} → ${lugarCorto(s.destino_texto)} · Revisa la asignación` : "Llama al conductor";
      pend.push({ titulo: a.texto, cuerpo, data: { tipo: "horario", ...(a.servicioId ? { servicioId: a.servicioId } : {}) } });
    }
    // Las que ya no se cumplen (inició la jornada, acabó el tramo, quedó libre, cerró la jornada…) se marcan resueltas:
    // dejan de salir como aviso en la central y de contar minutos.
    await resolverAlertasHorario(sb, ahora, (a) => alertaHorarioVigente({ tipo: a.tipo, clave: a.clave, servicioId: a.servicio_id }, horarios.get(a.conductor_id), ahora, {
      jornadaAbierta: abierta.has(a.conductor_id), conJornada, servicios: enCurso.get(a.conductor_id) ?? [],
      ausente: !!ausenciaEn((aus ?? []) as Ausencia[], a.conductor_id, new Date(ahora)),
    }));
  } catch (err) {
    console.error("[vigilante] horarios:", err instanceof Error ? err.message : err);
  } finally {
    if (!salida) await enviarACentral(pend, { sb });
  }
  return nuevas;
}

type AlertaAbierta = { id: string; tipo: string; conductor_id: string; servicio_id: string | null; clave: string; creado_en: string };
/** Más de 24 h abierta: se da por resuelta igualmente (ya no es «en vivo»). */
const TOPE_ALERTA_MS = 24 * 3600e3;

/** Marca `resuelta_en` en las alertas de horario abiertas (salvo «jornada_larga», que va aparte) que ya no siguen vigentes. */
async function resolverAlertasHorario(sb: ReturnType<typeof clienteAdmin>, ahora: number, vigente: (a: AlertaAbierta) => boolean): Promise<void> {
  const { data, error } = await sb.from("alertas_horario").select("id,tipo,conductor_id,servicio_id,clave,creado_en")
    .is("resuelta_en", null).in("tipo", ["fuera_horario", "sin_jornada", "fin_turno"]).order("creado_en").limit(300);
  if (error) { console.error("[vigilante] alertas abiertas:", error.message); return; }
  const cerrar = ((data ?? []) as AlertaAbierta[]).filter((a) => ahora - Date.parse(a.creado_en) > TOPE_ALERTA_MS || !vigente(a)).map((a) => a.id);
  if (!cerrar.length) return;
  const { error: e } = await sb.from("alertas_horario").update({ resuelta_en: new Date(ahora).toISOString() }).in("id", cerrar).is("resuelta_en", null);
  if (e) console.error("[vigilante] resolver alertas:", e.message);
  else console.log(`[vigilante] ${cerrar.length} alerta(s) de horario resuelta(s)`);
}

/**
 * Jornadas abiertas más de 14 h (¿se olvidó de cerrarla?): UNA alerta a la central por jornada (clave = id de la
 * jornada, índice único) y se resuelve sola al cerrarla. Para todos los conductores, tengan horario o no.
 */
async function pasadaJornadasLargas(sb: ReturnType<typeof clienteAdmin>, ahora: number, pend: MensajeCentral[]): Promise<void> {
  try {
    const [{ data: js, error }, { data: abiertasAl, error: e2 }] = await Promise.all([
      sb.from("jornadas").select("id,conductor_id,inicio,fin").is("fin", null)
        .lte("inicio", new Date(ahora - HORAS_JORNADA_LARGA * 3600e3).toISOString()).order("inicio").limit(100),
      sb.from("alertas_horario").select("id,clave").eq("tipo", "jornada_larga").is("resuelta_en", null).limit(200),
    ]);
    if (error || e2) { console.error("[vigilante] jornadas largas:", (error ?? e2)!.message); return; }
    const largas = (js ?? []) as { id: string; conductor_id: string; inicio: string; fin: string | null }[];
    const abiertas = new Set(largas.map((j) => j.id));
    const cerrar = ((abiertasAl ?? []) as { id: string; clave: string }[]).filter((a) => !abiertas.has(a.clave)).map((a) => a.id);
    if (cerrar.length) {
      const { error: e } = await sb.from("alertas_horario").update({ resuelta_en: new Date(ahora).toISOString() }).in("id", cerrar).is("resuelta_en", null);
      if (e) console.error("[vigilante] resolver jornadas largas:", e.message);
    }
    const yaAvisadas = new Set(((abiertasAl ?? []) as { clave: string }[]).map((a) => a.clave));
    const nuevas = largas.filter((j) => !yaAvisadas.has(j.id));
    if (!nuevas.length) return;
    const { data: pers } = await sb.from("perfiles").select("id,nombre").in("id", [...new Set(nuevas.map((j) => j.conductor_id))]);
    const nombre = new Map(((pers ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
    for (const j of nuevas) {
      const a = alertaJornadaLarga(nombre.get(j.conductor_id) ?? "Un conductor", j, ahora);
      if (!a) continue;
      const { data, error: e } = await sb.from("alertas_horario")
        .upsert({ tipo: a.tipo, conductor_id: j.conductor_id, servicio_id: null, clave: a.clave, texto: a.texto.slice(0, 300) },
          { onConflict: "tipo,conductor_id,clave", ignoreDuplicates: true })
        .select("id");
      if (e) { console.error("[vigilante] jornada larga:", e.message); continue; }
      if (!data?.length) continue; // ya avisada (y quizá resuelta) antes
      console.log(`[vigilante] jornada larga · ${j.id}`);
      pend.push({ titulo: a.texto, cuerpo: "Llama al conductor o revisa su jornada", data: { tipo: "horario" } });
    }
  } catch (err) {
    console.error("[vigilante] jornadas largas:", err instanceof Error ? err.message : err);
  }
}

/**
 * Recorridos de los servicios completados (últimas 48 h). Tras arrancar el proceso, primero un retro-relleno de los
 * últimos 30 días (solo los que faltan; mientras queden posiciones) hasta que no quede ninguno pendiente.
 * Nunca rompe la pasada de avisos.
 */
async function pasadaRecorridos(sb: ReturnType<typeof clienteAdmin>): Promise<void> {
  const g = globalThis as { __recorridosRetro?: boolean };
  try {
    const retro = !g.__recorridosRetro;
    const r = await actualizarRecorridos(sb, { horas: retro ? 30 * 24 : 48 });
    if (retro && r.pendientes === 0) g.__recorridosRetro = true;
    if (r.calculados) console.log(`[vigilante] recorridos: ${r.calculados} calculado(s)${r.pendientes ? `, ${r.pendientes} pendiente(s)` : ""}`);
  } catch (e) {
    console.error("[vigilante] recorridos:", e instanceof Error ? e.message : e);
  }
}

/**
 * Arranca el vigilante (una vez por proceso). Cadena de setTimeout en vez de setInterval: la siguiente pasada se
 * programa al TERMINAR la anterior, así que nunca se solapan ni se acumulan. Si falla (Supabase caído), espera con
 * backoff (40 s, 80 s… hasta 5 min) en vez de insistir cada 20 s. Cada consulta tiene tiempo máximo (clienteAdmin).
 */
export function arrancarVigilante(cadaMs = 20_000, pasada: () => Promise<unknown> = vigilarUnaVez): void {
  const g = globalThis as { __vigilantePush?: boolean };
  if (g.__vigilantePush) return;
  g.__vigilantePush = true;
  let fallos = 0;
  const programar = (ms: number) => { setTimeout(correr, ms).unref?.(); };
  const correr = async () => {
    try { await pasada(); fallos = 0; }
    catch (e) { fallos++; console.error(`[vigilante] falló (${fallos} seguidos):`, e instanceof Error ? e.message : e); }
    programar(fallos ? Math.max(cadaMs, esperaBackoff(fallos, { baseMs: cadaMs * 2, topeMs: 5 * 60_000 })) : cadaMs);
  };
  programar(cadaMs);
  console.log("[vigilante] push a la central activo");
}
