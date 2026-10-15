import { leerDeshecho } from "./deshacer";
import { leerMotivoAviso, NOMBRE_AVISO } from "./avisoCliente";
import { direccionCorta } from "./direccion";
import { esIncidenciaGrave, nombreTipoIncidencia } from "./incidencias";
import { etiquetaEvento } from "./navegacion";
import { zonaCercana } from "./zonas";
import { etiquetaZona, normalizarZonas, resumenCierre, type GravedadCierre, type Tecnico } from "./cierre";
import { agruparFinJornada, textoDevueltosFinJornada, textoJornadaConPendientes } from "./finJornada";
import { leerMotivoAnomalia, textoAnomalia } from "./anomalias";
import { PREFIJO_ASIGNADO_AUSENTE } from "./ausencias";
import { PREFIJO_FUERA_HORARIO, textoFueraDeSuHorario } from "./horarios";

/**
 * «Actividad en vivo» de la central (lógica pura, compartida por la web y por /api/central/resumen de la app):
 * un feed unificado con TODOS los movimientos (eventos de servicio, incidencias, checklists y jornadas) en frases
 * naturales, con conductor, servicio, zona con nombre y gravedad.
 */
export type Gravedad = "grave" | "aviso" | "info";

export interface Movimiento {
  /** Único y estable: «ev-123», «inc-<uuid>», «rev-<uuid>», «jor-<uuid>-i|f». */
  id: string;
  en: string;
  /** Hora del movimiento (HH:MM, Madrid). */
  hora: string;
  tipo: string;
  icono: string;
  gravedad: Gravedad;
  texto: string;
  /** Servicio: «Lucía · 15:00 · Salou → Aeropuerto de Reus». */
  detalle: string | null;
  conductorId: string | null;
  conductor: string | null;
  telefono: string | null;
  servicioId: string | null;
  zona: string | null;
  lat: number | null;
  lng: number | null;
  incidenciaId: string | null;
  descripcion: string | null;
  /** Grave sin resolver: se fija arriba en «Alertas» hasta que la central la marca vista/resuelta. */
  pendiente: boolean;
  /** Hoja de cierre (id para «Visto», matrícula) e incidencias con parte de golpes: zonas dañadas (mini-diagrama). */
  cierreId?: string | null;
  zonasDanadas?: string[];
  matricula?: string | null;
  /** Aviso que pide atención (CARGA/DESCARGA lejos, jornada cerrada con pendientes): tarjeta con «Ver en el mapa» y «Llamar». */
  alerta?: boolean;
}

export interface EventoAct { id: number; servicio_id: string; tipo: string; motivo: string | null; creado_en: string; actor_id?: string | null }
export interface IncidenciaAct {
  id: string; conductor_id: string; servicio_id: string | null; tipo: string; descripcion: string;
  lat: number | null; lng: number | null; creado_en: string; resuelta: boolean;
  /** Parte de golpes (accidente / golpe): zonas dañadas del diagrama. */
  zonas?: string[] | null;
}
export interface RevisionAct { id: string; conductor_id: string; vehiculo_id: string; con_fallos: boolean; observaciones?: string | null; creado_en: string }
export interface JornadaAct { id: string; conductor_id: string; inicio: string; fin: string | null;
  /** Servicios de hoy sin devolver al cerrar (lo rellena el vigilante; null = aún sin revisar). */
  pendientes_cierre?: { id: string; hora: string }[] | null }
export interface CierreAct {
  id: string; conductor_id: string; vehiculo_id: string; zonas: string[]; tecnico: Tecnico; combustible: string;
  comentario: string | null; gravedad: GravedadCierre; creado_en: string; visto: boolean;
}
export interface ServicioAct {
  id: string; cliente_nombre: string; origen_texto: string; destino_texto: string; fecha_hora_recogida: string;
  conductor_id: string | null; origen_pedido?: string | null;
}
/** Alerta de horario (tabla alertas_horario, la escribe el vigilante): fuera de horario, sin iniciar jornada, fin de turno. */
export interface AlertaHorarioAct { id: string; tipo: string; conductor_id: string; servicio_id: string | null; texto: string; creado_en: string }
export interface EntradaActividad {
  alertasHorario?: AlertaHorarioAct[];
  eventos?: EventoAct[]; incidencias?: IncidenciaAct[]; revisiones?: RevisionAct[]; jornadas?: JornadaAct[]; cierres?: CierreAct[];
  servicios: Iterable<ServicioAct>;
  conductores: { id: string; nombre: string; telefono?: string | null }[];
  posiciones?: { conductor_id: string; lat: number; lng: number }[];
  vehiculos?: { id: string; matricula: string }[];
  /** Solo lo posterior (las graves pendientes se incluyen siempre en `graves`). */
  desde?: Date;
  /** Servicios ocultos (pruebas automáticas): sus eventos e incidencias no salen en la actividad. */
  ocultos?: Iterable<string>;
}

export { TIPOS_GRAVES, esIncidenciaGrave } from "./incidencias";
export const LIMITE_ACTIVIDAD = 40;
export const HORAS_ACTIVIDAD = 12;

const fmtHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const fmtDia = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });
export const horaMadrid = (iso: string) => fmtHora.format(new Date(iso));
const diaMadrid = (iso: string) => fmtDia.format(new Date(iso));
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const ESPECIAL = /^(aeropuerto|aeroport|airport|estaci[oó]n?|port ?aventura|hotel|terminal|t[12]\b)/i;
const primeraParte = (t: string) => direccionCorta(t).principal.split(",")[0].trim();

/** Para trayectos: la localidad, o el lugar si es conocido («Salou», «Aeropuerto de Reus»). */
export function lugarBreve(texto: string): string {
  const d = direccionCorta(texto);
  const p = primeraParte(texto);
  if (ESPECIAL.test(p)) return recortar(p, 30);
  if (d.localidad) return recortar(d.localidad, 30);
  return recortar(p.split(/\s[–-]\s/)[0].trim() || p, 30);
}
/** Para recogidas/entregas: «Salou – Plaza Europa», «Aeropuerto de Reus», «Reus – Avinguda de Bellissens». */
export function lugarDetallado(texto: string): string {
  const d = direccionCorta(texto);
  const p = primeraParte(texto);
  if (!d.localidad || ESPECIAL.test(p) || p.toLowerCase().includes(d.localidad.toLowerCase())) return recortar(p, 45);
  return recortar(`${d.localidad} – ${p}`, 45);
}
export const trayectoBreve = (s: Pick<ServicioAct, "origen_texto" | "destino_texto">) => `${lugarBreve(s.origen_texto)} → ${lugarBreve(s.destino_texto)}`;

/** «las 15:00» si es el mismo día que el movimiento; si no, «las 15:00 del 12/10». */
function cuando(s: ServicioAct, en: string) {
  const h = horaMadrid(s.fecha_hora_recogida);
  return diaMadrid(s.fecha_hora_recogida) === diaMadrid(en) ? `las ${h}` : `las ${h} del ${diaMadrid(s.fecha_hora_recogida)}`;
}

const ICONO: Record<string, string> = {
  creado: "🆕", asignado: "📤", reasignado: "🔁", aceptado: "✅", rechazado: "❌", expirado: "⏰", en_camino: "🚗",
  llegando_recogida: "📍", llegando_destino: "📍", recogido: "🧳", completado: "🏁", cancelado: "🚫", subcontratado: "🤝",
  llegada_vuelo: "✈️", recogida_reajustada: "🕒", retraso_recogida: "🔴", deshecho: "↩️", devuelto: "🔁", aviso_cliente: "💬",
  anomalia_carga: "⚠️", anomalia_descarga: "⚠️", desasignado: "↩️",
};
/** Eventos que hace el propio conductor (el actor es él). En el resto se nombra al conductor asignado. */
const DEL_CONDUCTOR = new Set(["aceptado", "rechazado", "en_camino", "recogido", "completado", "llegando_recogida", "llegando_destino", "devuelto",
  "anomalia_carga", "anomalia_descarga"]);

export function construirActividad(e: EntradaActividad, limite = LIMITE_ACTIVIDAD): { movimientos: Movimiento[]; graves: Movimiento[]; avisos: Movimiento[] } {
  const servicios = new Map<string, ServicioAct>();
  for (const s of e.servicios) servicios.set(s.id, s);
  const ocultos = new Set(e.ocultos ?? []);
  const gente = new Map(e.conductores.map((c) => [c.id, c]));
  const pos = new Map((e.posiciones ?? []).map((p) => [p.conductor_id, p]));
  const matr = new Map((e.vehiculos ?? []).map((v) => [v.id, v.matricula]));
  const nombre = (id: string | null) => (id && gente.get(id)?.nombre) || "Un conductor";
  const base = (id: string, en: string, conductorId: string | null, s: ServicioAct | undefined): Movimiento => ({
    id, en, hora: horaMadrid(en), tipo: "", icono: "•", gravedad: "info", texto: "",
    detalle: s ? [s.cliente_nombre?.trim() || null, horaMadrid(s.fecha_hora_recogida), trayectoBreve(s)].filter(Boolean).join(" · ") : null,
    conductorId, conductor: conductorId ? (gente.get(conductorId)?.nombre ?? null) : null, telefono: conductorId ? (gente.get(conductorId)?.telefono ?? null) : null,
    servicioId: s?.id ?? null, zona: null, lat: null, lng: null, incidenciaId: null, descripcion: null, pendiente: false,
  });
  const out: Movimiento[] = [];

  // A quién se envió un servicio: el evento no lo guarda (el actor es la central). Se deduce de la respuesta posterior
  // (aceptado/rechazado…) antes del siguiente envío; si no la hay, el conductor asignado ahora.
  const porServicio = new Map<string, EventoAct[]>();
  for (const ev of e.eventos ?? []) porServicio.set(ev.servicio_id, [...(porServicio.get(ev.servicio_id) ?? []), ev]);
  for (const l of porServicio.values()) l.sort((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en) || a.id - b.id);
  const destinatario = (ev: EventoAct): string | null => {
    const l = porServicio.get(ev.servicio_id) ?? [];
    for (const x of l.slice(l.indexOf(ev) + 1)) {
      if (x.tipo === "asignado" || x.tipo === "reasignado") break;
      if (DEL_CONDUCTOR.has(x.tipo) && x.actor_id) return x.actor_id;
    }
    return servicios.get(ev.servicio_id)?.conductor_id ?? null;
  };

  // «Fin de jornada»: las devoluciones del mismo conductor en pocos minutos, en un solo movimiento.
  const agrupados = new Set<number>();
  for (const g of agruparFinJornada((e.eventos ?? []).filter((x) => !ocultos.has(x.servicio_id)))) {
    if (g.length < 2) continue;
    g.forEach((x) => agrupados.add(x.id));
    const ult = g[g.length - 1];
    const servs = g.map((x) => servicios.get(x.servicio_id)).filter((x): x is ServicioAct => !!x);
    const cid = g[0].actor_id ?? null;
    const m = base(`fdj-${g[0].id}`, ult.creado_en, cid, undefined);
    out.push({ ...m, tipo: "devuelto_fin_jornada", icono: "🔁", gravedad: "aviso", servicioId: servs[0]?.id ?? null,
      texto: textoDevueltosFinJornada(nombre(cid), servs.length ? servs.map((x) => x.fecha_hora_recogida) : g.map(() => ult.creado_en)),
      detalle: servs.map((x) => `${horaMadrid(x.fecha_hora_recogida)} ${trayectoBreve(x)}`).join(" · ") || null, descripcion: "Fin de jornada" });
  }

  for (const ev of e.eventos ?? []) {
    if (ocultos.has(ev.servicio_id) || agrupados.has(ev.id)) continue;
    const s = servicios.get(ev.servicio_id);
    const deshecho = ev.tipo === "deshecho" ? leerDeshecho(ev.motivo) : null;
    // Aviso al cliente: lo manda el conductor o la central (actor que no es conductor → «La central»).
    const avisoCentral = ev.tipo === "aviso_cliente" && !!ev.actor_id && !gente.has(ev.actor_id);
    const cid = DEL_CONDUCTOR.has(ev.tipo) || (deshecho && !deshecho.central) ? (ev.actor_id ?? s?.conductor_id ?? null)
      : ev.tipo === "aviso_cliente" ? (avisoCentral ? (s?.conductor_id ?? null) : (ev.actor_id ?? s?.conductor_id ?? null))
      : ev.tipo === "asignado" || ev.tipo === "reasignado" ? destinatario(ev) : (s?.conductor_id ?? null);
    const m = base(`ev-${ev.id}`, ev.creado_en, cid, s);
    const N = nombre(cid);
    const serv = s ? `el servicio de ${cuando(s, ev.creado_en)}` : "un servicio";
    const Serv = s ? `Servicio de ${cuando(s, ev.creado_en)}` : "Servicio";
    const T = s ? ` · ${trayectoBreve(s)}` : "";
    const C = s?.cliente_nombre?.trim() || null;
    const O = s ? lugarDetallado(s.origen_texto) : null, D = s ? lugarDetallado(s.destino_texto) : null;
    let texto: string;
    switch (ev.tipo) {
      case "creado": texto = s?.origen_pedido === "web" ? `Reserva nueva de la web para ${s ? cuando(s, ev.creado_en) : "un servicio"}${T}` : `Servicio nuevo para ${s ? cuando(s, ev.creado_en) : "—"}${T}`; break;
      case "asignado": case "reasignado": {
        texto = `${Serv} ${ev.tipo === "asignado" ? "enviado" : "reasignado"} a ${cid ? N : "un conductor"}${T}`;
        // Asignado igualmente a un conductor ausente (vacaciones, baja…): queda registrado.
        if (ev.motivo?.startsWith(`${PREFIJO_ASIGNADO_AUSENTE}:`)) { texto += ` · aunque estaba de ${ev.motivo.slice(PREFIJO_ASIGNADO_AUSENTE.length + 1).trim()}`; m.gravedad = "aviso"; }
        // Asignado igualmente fuera de su horario (pausa, fuera de turno, sin tiempo de volver a la base).
        else if (ev.motivo?.startsWith(`${PREFIJO_FUERA_HORARIO}:`)) { texto += ` · ${textoFueraDeSuHorario(ev.motivo.slice(PREFIJO_FUERA_HORARIO.length + 1))}`; m.gravedad = "aviso"; }
        break;
      }
      case "desasignado": {
        const motivo = ev.motivo?.trim() ? ` (${recortar(ev.motivo.trim(), 120)})` : "";
        texto = `↩ La central ha quitado ${serv} al conductor para reasignarlo${motivo}`;
        m.gravedad = "aviso";
        break;
      }
      case "anomalia_carga": case "anomalia_descarga": {
        // CARGA / DESCARGA lejos del punto: posición del conductor en ese momento (para «Ver en el mapa»).
        const a = leerMotivoAnomalia(ev.motivo);
        const lugar = s ? lugarDetallado(ev.tipo === "anomalia_carga" ? s.origen_texto : s.destino_texto) : null;
        texto = a ? textoAnomalia(N, ev.tipo, a.distanciaM, lugar, a) : `⚠️ ${N}: ${etiquetaEvento(ev.tipo)}`;
        if (a) { m.lat = a.lat; m.lng = a.lng; m.zona = zonaCercana(a.lat, a.lng)?.texto ?? null; }
        m.gravedad = "aviso"; m.alerta = true;
        break;
      }
      case "aceptado": texto = `${N} ha aceptado ${serv}${T}`; break;
      case "rechazado": texto = ev.motivo?.trim() ? `${N} ha rechazado: ${recortar(ev.motivo.trim(), 120)}` : `${N} ha rechazado ${serv}`; m.gravedad = "aviso"; break;
      case "expirado": texto = `${N} no ha respondido a tiempo a ${serv}`; m.gravedad = "aviso"; break;
      case "en_camino": texto = `${N} va hacia la recogida${C ? ` de ${C}` : ""}${O ? ` en ${O}` : ""}`; break;
      case "llegando_recogida": texto = `${N} está llegando a la recogida${C ? ` de ${C}` : ""}${O ? ` en ${O}` : ""}`; break;
      case "recogido": texto = `${N} ha recogido ${C ? `a ${C}` : "al cliente"}${O ? ` en ${O}` : ""}`; break;
      case "llegando_destino": texto = `${N} está llegando${D ? ` a ${D}` : " al destino"}${C ? ` con ${C}` : ""}`; break;
      case "completado": texto = `${N} ha dejado ${C ? `a ${C}` : "al cliente"}${D ? ` en ${D}` : ""} · queda libre`; break;
      case "cancelado": texto = `${Serv} cancelado${T}`; break;
      case "subcontratado": texto = `${Serv} subcontratado${T}`; break;
      case "retraso_recogida": {
        // Detectado por el servidor (actor null): conductor asignado y su última posición conocida.
        const p = cid ? pos.get(cid) : undefined;
        m.zona = p ? zonaCercana(p.lat, p.lng)?.texto ?? null : null;
        m.lat = p?.lat ?? null; m.lng = p?.lng ?? null;
        texto = [`⏰ ${N} llega tarde a la recogida de ${s ? cuando(s, ev.creado_en) : "un servicio"}`, s ? trayectoBreve(s) : null, m.zona].filter(Boolean).join(" · ");
        m.gravedad = "aviso";
        break;
      }
      case "deshecho": {
        // Botón «Deshacer» del conductor (≤ 10 min tras su último paso) o de la central desde la ficha.
        const paso = deshecho?.nombre ? `la ${deshecho.nombre}` : "el último paso";
        const deServ = s ? `del servicio de ${cuando(s, ev.creado_en)}` : "de un servicio";
        texto = deshecho?.central
          ? `↩ La central ha deshecho ${paso} ${deServ}${cid ? ` (${N})` : ""}`
          : `↩ ${N} ha deshecho ${paso} ${deServ}`;
        m.gravedad = "aviso";
        break;
      }
      case "devuelto": {
        // «No puedo hacer este servicio»: vuelve a «Sin asignar» y la central tiene que reasignarlo.
        const motivo = ev.motivo?.trim() ? `: ${recortar(ev.motivo.trim(), 120)}` : "";
        texto = `🔁 ${N} ha devuelto ${serv}${motivo}`;
        m.gravedad = "aviso";
        break;
      }
      case "aviso_cliente": {
        const a = leerMotivoAviso(ev.motivo);
        const que = a ? NOMBRE_AVISO[a.tipo] : "aviso";
        const canal = a?.canal === "sms" ? " (SMS)" : "";
        texto = `💬 ${avisoCentral ? "La central" : N} ha avisado al cliente${C ? ` (${C})` : ""}: ${que}${canal}`;
        break;
      }
      default: texto = `${etiquetaEvento(ev.tipo)} · ${serv}`;
    }
    out.push({ ...m, tipo: ev.tipo, icono: ICONO[ev.tipo] ?? "•", texto, descripcion: ev.tipo === "rechazado" || ev.tipo === "devuelto" ? ev.motivo : null });
  }

  for (const i of e.incidencias ?? []) {
    if (i.servicio_id && ocultos.has(i.servicio_id)) continue;
    const s = i.servicio_id ? servicios.get(i.servicio_id) : undefined;
    const m = base(`inc-${i.id}`, i.creado_en, i.conductor_id, s);
    const p = i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : pos.get(i.conductor_id) ?? null;
    const zona = p ? zonaCercana(p.lat, p.lng)?.texto ?? null : null;
    const grave = esIncidenciaGrave(i.tipo);
    const desc = i.descripcion?.trim() || null;
    const N = nombre(i.conductor_id);
    const zonas = normalizarZonas(i.zonas ?? []);
    const danos = zonas.length ? zonas.map(etiquetaZona).join(", ") : null;
    // «⚠ GOLPE · Marc · cerca de Reus · Puerta del. izq., Aleta tras. der.»
    const texto = grave
      ? ["⚠ " + nombreTipoIncidencia(i.tipo).toUpperCase(), N, zona, danos, desc ? recortar(desc, 160) : null].filter(Boolean).join(" · ")
      : [`${N} avisa: ${i.tipo === "otro" ? "incidencia" : nombreTipoIncidencia(i.tipo).toLowerCase()}`, zona, desc ? recortar(desc, 160) : null].filter(Boolean).join(" · ");
    out.push({
      ...m, tipo: `incidencia_${i.tipo}`, icono: grave ? "🚨" : i.tipo === "retraso" ? "⏱️" : i.tipo === "no_presentado" ? "🙋" : "⚠️",
      gravedad: grave ? "grave" : "aviso", texto, zona, lat: p?.lat ?? null, lng: p?.lng ?? null, incidenciaId: i.id, descripcion: desc,
      pendiente: grave && !i.resuelta, ...(zonas.length ? { zonasDanadas: zonas } : {}),
    });
  }

  for (const r of e.revisiones ?? []) {
    const m = base(`rev-${r.id}`, r.creado_en, r.conductor_id, undefined);
    const v = matr.get(r.vehiculo_id) ?? "vehículo";
    const obs = r.observaciones?.trim() || null;
    out.push({
      ...m, tipo: "checklist", icono: "📋", gravedad: r.con_fallos ? "aviso" : "info", descripcion: obs,
      texto: r.con_fallos ? `${nombre(r.conductor_id)}: checklist con fallos · ${v}${obs ? ` · ${recortar(obs, 120)}` : ""}` : `${nombre(r.conductor_id)} ha pasado el checklist de ${v} sin fallos`,
    });
  }

  for (const j of e.jornadas ?? []) {
    out.push({ ...base(`jor-${j.id}-i`, j.inicio, j.conductor_id, undefined), tipo: "jornada_inicio", icono: "▶️", texto: `${nombre(j.conductor_id)} ha empezado la jornada` });
    if (j.fin && j.pendientes_cierre?.length) {
      // Cerró la jornada con servicios de hoy sin devolver (red de seguridad del vigilante): la central tiene que actuar.
      const m = base(`jor-${j.id}-f`, j.fin, j.conductor_id, undefined);
      const p = pos.get(j.conductor_id);
      out.push({ ...m, tipo: "jornada_pendientes", icono: "⚠️", gravedad: "aviso", alerta: true,
        texto: textoJornadaConPendientes(nombre(j.conductor_id), j.pendientes_cierre.map((x) => x.hora)),
        servicioId: j.pendientes_cierre[0]?.id ?? null, lat: p?.lat ?? null, lng: p?.lng ?? null, zona: p ? zonaCercana(p.lat, p.lng)?.texto ?? null : null });
    } else if (j.fin) out.push({ ...base(`jor-${j.id}-f`, j.fin, j.conductor_id, undefined), tipo: "jornada_fin", icono: "⏹️", texto: `${nombre(j.conductor_id)} ha terminado la jornada` });
  }

  // Alertas de horario (una por caso): tarjeta ámbar con «Ver en el mapa» y «Llamar».
  for (const a of e.alertasHorario ?? []) {
    if (a.servicio_id && ocultos.has(a.servicio_id)) continue;
    const s = a.servicio_id ? servicios.get(a.servicio_id) : undefined;
    const m = base(`ah-${a.id}`, a.creado_en, a.conductor_id, s);
    const p = pos.get(a.conductor_id);
    out.push({ ...m, tipo: `horario_${a.tipo}`, icono: a.tipo === "sin_jornada" ? "⏰" : a.tipo === "fin_turno" ? "🕒" : "⚠️", gravedad: "aviso", alerta: true,
      texto: a.texto, lat: p?.lat ?? null, lng: p?.lng ?? null, zona: p ? zonaCercana(p.lat, p.lng)?.texto ?? null : null });
  }

  // Hoja de cierre: grave (daños, testigo, avería) → tarjeta roja fija hasta «Visto»; mantenimiento → aviso; ok → info verde.
  for (const c of e.cierres ?? []) {
    const m = base(`cie-${c.id}`, c.creado_en, c.conductor_id, undefined);
    const zonas = normalizarZonas(c.zonas ?? []);
    const matricula = matr.get(c.vehiculo_id) ?? null;
    const coment = c.comentario?.trim() || null;
    const texto = resumenCierre({ zonas, tecnico: c.tecnico ?? ({} as Tecnico), combustible: c.combustible, matricula: matricula ?? "vehículo", conductor: nombre(c.conductor_id) });
    out.push({
      ...m, tipo: `cierre_${c.gravedad}`, icono: "🚐", // el color (🔴/🟠/🟢) ya va al principio del texto
      gravedad: c.gravedad === "grave" ? "grave" : c.gravedad === "mantenimiento" ? "aviso" : "info",
      texto: coment ? `${texto} · «${recortar(coment, 120)}»` : texto, descripcion: coment,
      pendiente: c.gravedad === "grave" && !c.visto, cierreId: c.id, zonasDanadas: zonas, matricula,
    });
  }

  // Fechas de Supabase/Realtime con formatos distintos («…+00:00», «…Z»): se ordena por instante, no por texto.
  const t = (m: Movimiento) => Date.parse(m.en) || 0;
  const orden = (a: Movimiento, b: Movimiento) => t(b) - t(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const unicos = [...new Map(out.map((m) => [m.id, m])).values()].sort(orden);
  const desde = e.desde?.getTime();
  const recientes = desde != null ? unicos.filter((m) => t(m) >= desde) : unicos;
  return { movimientos: recientes.slice(0, limite), graves: unicos.filter((m) => m.pendiente), avisos: recientes.filter((m) => m.alerta) };
}

// ── Alarma insistente (central web y app): suena al aparecer una grave nueva y se repite cada 30 s, máx. 5 veces,
// mientras queden graves sin ver. Una grave nueva reinicia la cuenta. ──
export const ALARMA_CADA_MS = 30_000, ALARMA_MAX = 5;
export interface EstadoAlarma { ids: string[]; veces: number; ultima: number }

export function pasoAlarma(prev: EstadoAlarma | null, pendientes: string[], ahora: number, cadaMs = ALARMA_CADA_MS, max = ALARMA_MAX): { sonar: boolean; estado: EstadoAlarma | null } {
  if (!pendientes.length) return { sonar: false, estado: null };
  const ids = [...pendientes].sort();
  if (!prev || ids.some((id) => !prev.ids.includes(id))) return { sonar: true, estado: { ids, veces: 1, ultima: ahora } };
  if (prev.veces < max && ahora - prev.ultima >= cadaMs) return { sonar: true, estado: { ids, veces: prev.veces + 1, ultima: ahora } };
  return { sonar: false, estado: { ...prev, ids } };
}

/** «45 min», «1 h», «4 h 12 min». */
export function duracionMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
/**
 * Texto de una alerta con los minutos al día: «(hace 15 min)» o «sigue en servicio 35 min después de su turno» se
 * escribieron al crear la alerta (`en`); al mostrarla se les suma lo que ha pasado desde entonces.
 */
export function textoAlDia(texto: string, en: string, ahora: number): string {
  const pasado = Math.max(0, Math.floor((ahora - Date.parse(en)) / 60_000));
  if (!Number.isFinite(pasado) || !pasado) return texto;
  return texto
    .replace(/\(hace (\d+) min\)/g, (_, n: string) => `(hace ${duracionMin(Number(n) + pasado)})`)
    .replace(/(\d+) min después de su turno/g, (_, n: string) => `${duracionMin(Number(n) + pasado)} después de su turno`);
}
