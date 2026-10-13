import type { Punto } from "./tipos";
import { diaMadrid } from "./geo";
import { madridAUtc, sumarDias } from "./dias";
import { tiempoTraslado } from "./planificacion";

/**
 * Horarios de los conductores (lógica pura compartida por la central, el servidor, el vigilante y las apps).
 *
 * Un conductor trabaja una jornada continua (08:00–15:00) o partida (08:00–13:00 · 16:00–20:00) con un rato para comer.
 * El coche SIEMPRE vuelve a la base (ajustes.base_*) y allí se hace el relevo con el siguiente conductor.
 *
 * Reglas:
 * - Sin horario definido (ninguna fila de semana tipo ni excepción ese día) = disponible todo el día (como antes).
 * - Día con fecha (cambio puntual o planificación de semanas/meses) > semana tipo > sin restricción. Tramos [] = libre.
 * - Con semana tipo, un día sin fila también es libre (la central ve los 7 días en el editor).
 * - Horas de pared de Madrid («08:00»); «24:00» = medianoche del día siguiente.
 * - Turno de noche: un tramo cuyo fin es anterior a su inicio (22:00–06:00) termina al día siguiente. Pertenece al día en
 *   que empieza; la parte de después de medianoche cuenta también como turno del día siguiente (arrastre).
 * - Un servicio cabe si la recogida cae dentro de un tramo, si siendo el primero del tramo le da tiempo a salir de la
 *   base después del inicio, y si siendo el último le da tiempo a volver a la base antes del fin del tramo.
 */
export interface Tramo { inicio: string; fin: string }
export interface DiaSemanaHorario { dia_semana: number; tramos: Tramo[]; vehiculo_id?: string | null; plantilla_id?: string | null }
/** Día con fecha: «cambio» puntual (médico, cambio con un compañero) o «plan» (planificación de semanas / meses). */
export type TipoExcepcion = "cambio" | "plan";
export interface ExcepcionHorario { fecha: string; tramos: Tramo[]; nota?: string | null; vehiculo_id?: string | null; tipo?: TipoExcepcion }
export interface HorarioConductor { semana: DiaSemanaHorario[]; excepciones: ExcepcionHorario[] }
export interface Plantilla { id: string; nombre: string; tramos: Tramo[] }

export const MAX_TRAMOS = 4;
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const;
export const NOMBRE_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const INICIAL_DIA = ["", "L", "M", "X", "J", "V", "S", "D"] as const;
/** Avisos al conductor y a la central. */
export const AVISO_ANTES_MIN = 5;
export const GRACIA_SIN_JORNADA_MIN = 15;
export const VENTANA_SIN_JORNADA_MIN = 120;
export const GRACIA_FIN_TURNO_MIN = 30;
export const VENTANA_FIN_TURNO_MIN = 180;

const MIN = 60_000;
const HORA = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const hhmm = (t: number | Date) => fmt.format(typeof t === "number" ? new Date(t) : t);

/** «08:30» → 510 minutos. */
export const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Día de la semana ISO (1 = lunes … 7 = domingo) de un día «YYYY-MM-DD». */
export function diaSemana(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
/** Lunes de la semana de ese día. */
export const lunesDeSemana = (fecha: string) => sumarDias(fecha, 1 - diaSemana(fecha));

const ordenar = (ts: Tramo[]) => [...ts].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));

/** Turno de noche: termina al día siguiente (22:00–06:00). «…–24:00» no lo es: acaba justo a medianoche. */
export const esNocturno = (t: Tramo) => t.fin !== "24:00" && minutos(t.fin) <= minutos(t.inicio);
/** Fin en minutos desde las 00:00 del día en que empieza (06:00 de un turno de noche = 1800). */
export const finMinutos = (t: Tramo) => (esNocturno(t) ? minutos(t.fin) + 1440 : minutos(t.fin));

export type ValidacionTramos = { ok: true; tramos: Tramo[] } | { ok: false; error: string };
/**
 * Valida y ordena los tramos que manda la central (formato, que duren algo, sin solaparse, máx. 4). Un tramo con el fin
 * antes del inicio es de noche (acaba al día siguiente); su parte de después de medianoche no puede pisar el primer tramo.
 */
export function validarTramos(x: unknown): ValidacionTramos {
  if (!Array.isArray(x)) return { ok: false, error: "Tramos no válidos." };
  if (x.length > MAX_TRAMOS) return { ok: false, error: `Como mucho ${MAX_TRAMOS} tramos al día.` };
  const ts: Tramo[] = [];
  for (const t of x) {
    const inicio = typeof t?.inicio === "string" ? t.inicio.trim() : "", fin = typeof t?.fin === "string" ? t.fin.trim() : "";
    if (!HORA.test(inicio) || !HORA.test(fin) || inicio === "24:00") return { ok: false, error: "Indica las horas como 08:00." };
    if (minutos(fin) === minutos(inicio)) return { ok: false, error: `El tramo ${inicio}–${fin} no dura nada.` };
    ts.push({ inicio, fin });
  }
  const o = ordenar(ts);
  for (let i = 1; i < o.length; i++) {
    if (minutos(o[i].inicio) < finMinutos(o[i - 1])) return { ok: false, error: `Los tramos ${o[i - 1].inicio}–${o[i - 1].fin} y ${o[i].inicio}–${o[i].fin} se solapan.` };
  }
  const noche = o[o.length - 1];
  if (o.length > 1 && esNocturno(noche) && minutos(noche.fin) > minutos(o[0].inicio)) {
    return { ok: false, error: `El turno de noche ${noche.inicio}–${noche.fin} acaba después de que empiece el tramo de las ${o[0].inicio}.` };
  }
  return { ok: true, tramos: o };
}

/** Tramos leídos de la BD (jsonb): descarta lo que no sea válido en vez de romper. */
export function leerTramos(x: unknown): Tramo[] {
  if (!Array.isArray(x)) return [];
  const v = validarTramos(x);
  if (v.ok) return v.tramos;
  return ordenar(x.filter((t) => typeof t?.inicio === "string" && typeof t?.fin === "string" && HORA.test(t.inicio) && HORA.test(t.fin)
    && minutos(t.fin) !== minutos(t.inicio)).map((t) => ({ inicio: t.inicio, fin: t.fin })));
}

/** «08:00–13:00 · 16:00–20:00»; «Libre» si no hay tramos. */
export const textoTramos = (ts: readonly Tramo[]) => (ts.length ? ts.map((t) => `${t.inicio}–${t.fin}`).join(" · ") : "Libre");
/** «Continua» / «Partida» / «Libre». */
export const tipoJornada = (ts: readonly Tramo[]) => (ts.length === 0 ? "Libre" : ts.length === 1 ? "Continua" : "Partida");

/** Agrupa las filas de la BD por conductor. */
export function agruparHorarios(
  semana: readonly { conductor_id: string; dia_semana: number; tramos: unknown; vehiculo_id?: string | null; plantilla_id?: string | null }[],
  excepciones: readonly { conductor_id: string; fecha: string; tramos: unknown; nota?: string | null; vehiculo_id?: string | null; tipo?: string | null }[],
): Map<string, HorarioConductor> {
  const m = new Map<string, HorarioConductor>();
  const de = (id: string) => { let h = m.get(id); if (!h) { h = { semana: [], excepciones: [] }; m.set(id, h); } return h; };
  for (const f of semana) de(f.conductor_id).semana.push({ dia_semana: f.dia_semana, tramos: leerTramos(f.tramos), vehiculo_id: f.vehiculo_id ?? null, plantilla_id: f.plantilla_id ?? null });
  for (const f of excepciones) {
    de(f.conductor_id).excepciones.push({ fecha: f.fecha, tramos: leerTramos(f.tramos), nota: f.nota ?? null, vehiculo_id: f.vehiculo_id ?? null, tipo: f.tipo === "plan" ? "plan" : "cambio" });
  }
  return m;
}

export type DiaHorario =
  | { restringido: false; vehiculoId: string | null }
  | { restringido: true; tramos: Tramo[]; fuente: "excepcion" | "plan" | "semanal"; nota: string | null; vehiculoId: string | null };

/**
 * Tramos de ese día: día con fecha (cambio o plan) > semana tipo > sin restricción. El vehículo del turno: el del día
 * con fecha si lo tiene; si no, el de la semana tipo. `sinCambios`: ignora los cambios puntuales (para copiar meses).
 */
export function tramosDelDia(h: HorarioConductor | null | undefined, fecha: string, o: { sinCambios?: boolean } = {}): DiaHorario {
  const fila = h?.semana.find((d) => d.dia_semana === diaSemana(fecha));
  const ex = h?.excepciones.find((e) => e.fecha === fecha && !(o.sinCambios && e.tipo !== "plan"));
  const vehiculoId = ex?.vehiculo_id ?? fila?.vehiculo_id ?? null;
  if (ex) return { restringido: true, tramos: ordenar(ex.tramos), fuente: ex.tipo === "plan" ? "plan" : "excepcion", nota: ex.nota ?? null, vehiculoId };
  if (!h || h.semana.length === 0) return { restringido: false, vehiculoId };
  return { restringido: true, tramos: ordenar(fila?.tramos ?? []), fuente: "semanal", nota: null, vehiculoId };
}

/** Vehículo del turno de ese día (el que coge en la base); null = el habitual. */
export const vehiculoDelTurno = (h: HorarioConductor | null | undefined, fecha: string) => tramosDelDia(h, fecha).vehiculoId;

export interface Intervalo { fecha: string; tramo: Tramo; inicio: number; fin: number }
/** Instantes [inicio, fin) de un tramo que empieza ese día (respeta el cambio de hora; el de noche acaba al día siguiente). */
export function intervalo(fecha: string, t: Tramo): Intervalo {
  const fin = t.fin === "24:00" ? madridAUtc(sumarDias(fecha, 1), "00:00") : madridAUtc(esNocturno(t) ? sumarDias(fecha, 1) : fecha, t.fin);
  return { fecha, tramo: t, inicio: Date.parse(madridAUtc(fecha, t.inicio)), fin: Date.parse(fin) };
}
/** Turno de noche del día anterior que sigue después de medianoche (su intervalo completo, con fecha = día anterior). */
function arrastreNoche(h: HorarioConductor | null | undefined, fecha: string): Intervalo[] {
  const ayer = sumarDias(fecha, -1);
  const d = tramosDelDia(h, ayer);
  return d.restringido ? d.tramos.filter(esNocturno).map((t) => intervalo(ayer, t)) : [];
}
/** Intervalos que tocan el día (los suyos y el turno de noche de la víspera); null = sin restricción. */
export function intervalosDelDia(h: HorarioConductor | null | undefined, fecha: string): Intervalo[] | null {
  const d = tramosDelDia(h, fecha);
  return d.restringido ? [...arrastreNoche(h, fecha), ...d.tramos.map((t) => intervalo(fecha, t))] : null;
}
/**
 * Tramos para pintar un día de 00:00 a 24:00: la cola del turno de noche de la víspera (00:00–06:00) y los del día, con
 * el de noche cortado a las 24:00. null = sin horario.
 */
export function tramosPintadosDia(h: HorarioConductor | null | undefined, fecha: string): Tramo[] | null {
  const d = tramosDelDia(h, fecha);
  if (!d.restringido) return null;
  const ayer = tramosDelDia(h, sumarDias(fecha, -1));
  const cola = ayer.restringido ? ayer.tramos.filter((t) => esNocturno(t) && t.fin !== "00:00").map((t) => ({ inicio: "00:00", fin: t.fin })) : [];
  return [...cola, ...d.tramos.map((t) => (esNocturno(t) ? { inicio: t.inicio, fin: "24:00" } : t))];
}

const instante = (t: number | Date | string) => (typeof t === "number" ? t : typeof t === "string" ? Date.parse(t) : t.getTime());

/** Tramo que contiene [desde, hasta] (hasta = desde si no se indica); null si ninguno o sin horario. */
export function turnoQueContiene(h: HorarioConductor | null | undefined, desde: number | Date, hasta?: number | Date): Intervalo | null {
  const a = instante(desde), b = hasta == null ? a : instante(hasta);
  const ivs = intervalosDelDia(h, diaMadrid(new Date(a)));
  return ivs?.find((i) => i.inicio <= a && b <= i.fin && a < i.fin) ?? null;
}

/** ¿Está en turno en ese instante? Sin horario: siempre. */
export function enTurno(h: HorarioConductor | null | undefined, t: number | Date): boolean {
  const ivs = intervalosDelDia(h, diaMadrid(new Date(instante(t))));
  if (!ivs) return true;
  const x = instante(t);
  return ivs.some((i) => i.inicio <= x && x < i.fin);
}

export type EstadoTurno =
  | { estado: "sin_horario"; texto: string }
  | { estado: "en_turno"; hasta: string; texto: string }
  | { estado: "pausa"; hasta: string; texto: string }
  | { estado: "antes"; desde: string; texto: string }
  | { estado: "fuera"; texto: string }
  | { estado: "libre"; texto: string };

/** «en turno hasta 15:00», «en pausa hasta 16:00», «fuera de turno · entra a las 08:00», «fuera de turno», «libre hoy». */
export function estadoTurno(h: HorarioConductor | null | undefined, ahora: number | Date): EstadoTurno {
  const t = instante(ahora);
  const fecha = diaMadrid(new Date(t));
  const ivs = intervalosDelDia(h, fecha);
  if (!ivs) return { estado: "sin_horario", texto: "sin horario (disponible todo el día)" };
  if (!ivs.length) return { estado: "libre", texto: "libre hoy" };
  const dentro = ivs.find((i) => i.inicio <= t && t < i.fin);
  if (dentro) return { estado: "en_turno", hasta: dentro.tramo.fin, texto: `en turno hasta ${dentro.tramo.fin}` };
  const sig = ivs.find((i) => i.inicio > t);
  const hubo = ivs.some((i) => i.fin <= t && i.fecha === fecha); // la cola de anoche no es una pausa
  if (sig && hubo) return { estado: "pausa", hasta: sig.tramo.inicio, texto: `en pausa hasta ${sig.tramo.inicio}` };
  if (sig) return { estado: "antes", desde: sig.tramo.inicio, texto: `fuera de turno · entra a las ${sig.tramo.inicio}` };
  return { estado: "fuera", texto: "fuera de turno" };
}

export type TipoEncajeHorario = "sin_horario" | "ok" | "libre" | "pausa" | "fuera" | "antes" | "despues" | "no_vuelve";
export interface ResultadoHorario {
  cabe: boolean; tipo: TipoEncajeHorario; motivo: string | null; tramo: Tramo | null;
  /** Hora a la que sale de la base (primer servicio del tramo) y a la que vuelve (último); null si no aplica. */
  salidaBase: number | null; vueltaBase: number | null;
}
export interface ServicioHorario { id?: string; inicio: number | Date; duracionMin: number; origen: Punto | null; destino: Punto | null }

/**
 * ¿Cabe el servicio en el horario del conductor? `agenda`: sus otros servicios (inicio/fin en ms) para saber si es el
 * primero o el último del tramo (traslado desde/hasta la base). Sin base o sin coordenadas, solo cuentan las horas.
 */
export function cabeServicio(h: HorarioConductor | null | undefined, s: ServicioHorario,
  o: { base?: Punto | null; agenda?: readonly { id?: string; inicio: number; fin: number }[] } = {}): ResultadoHorario {
  const ini = instante(s.inicio);
  const fin = ini + s.duracionMin * MIN;
  const base = { cabe: true, tipo: "ok" as TipoEncajeHorario, motivo: null, tramo: null, salidaBase: null, vueltaBase: null };
  const fecha = diaMadrid(new Date(ini));
  const d = tramosDelDia(h, fecha);
  const ivs = intervalosDelDia(h, fecha);
  if (!d.restringido || !ivs) return { ...base, tipo: "sin_horario" };
  if (!ivs.length) return { ...base, cabe: false, tipo: "libre", motivo: `Fuera de horario (libre ese día${d.nota ? ` · ${d.nota}` : ""})` };
  const iv = ivs.find((i) => i.inicio <= ini && ini < i.fin);
  if (!iv) {
    const prev = ivs.filter((i) => i.fin <= ini && i.fecha === fecha).pop();
    const next = ivs.find((i) => i.inicio > ini);
    if (prev && next) return { ...base, cabe: false, tipo: "pausa", motivo: `Fuera de horario (pausa ${prev.tramo.fin}–${next.tramo.inicio})` };
    return { ...base, cabe: false, tipo: "fuera", motivo: `Fuera de horario (turno ${textoTramos(d.tramos.length ? d.tramos : ivs.map((i) => i.tramo))})` };
  }
  const otros = (o.agenda ?? []).filter((a) => (s.id == null || a.id !== s.id) && a.inicio < iv.fin && a.fin > iv.inicio);
  const primero = !otros.some((a) => a.inicio < ini);
  const ultimo = !otros.some((a) => a.inicio > ini);
  let salidaBase: number | null = null, vueltaBase: number | null = null;
  if (primero && o.base && s.origen) {
    salidaBase = ini - (tiempoTraslado(o.base, s.origen) ?? 0) * MIN;
    if (salidaBase < iv.inicio) {
      return { ...base, cabe: false, tipo: "antes", tramo: iv.tramo, salidaBase,
        motivo: `Empieza antes de su turno (saldría de la base a las ${hhmm(salidaBase)}; entra a las ${iv.tramo.inicio})` };
    }
  }
  if (ultimo && o.base && s.destino) {
    vueltaBase = fin + (tiempoTraslado(s.destino, o.base) ?? 0) * MIN;
    if (vueltaBase > iv.fin) return { ...base, cabe: false, tipo: "no_vuelve", tramo: iv.tramo, salidaBase, vueltaBase, motivo: `No vuelve a la base antes de las ${iv.tramo.fin}` };
  } else if (fin > iv.fin) {
    return { ...base, cabe: false, tipo: "despues", tramo: iv.tramo, salidaBase, motivo: `Termina después de su turno (${iv.tramo.fin})` };
  }
  return { ...base, tramo: iv.tramo, salidaBase, vueltaBase };
}

export interface SolapeVehiculo { vehiculoId: string; diaSemana: number; a: string; b: string; tramoA: Tramo; tramoB: Tramo }
/**
 * Mismo vehículo del turno para dos conductores en tramos que se solapan (semana tipo). Uno que termina a las 15:00 y
 * otro que empieza a las 15:00 NO se solapan: es el relevo en la base.
 */
export function solapeVehiculo(conductores: readonly { conductorId: string; semana: readonly DiaSemanaHorario[] }[]): SolapeVehiculo[] {
  const out: SolapeVehiculo[] = [];
  // Por día: [desde, hasta) en minutos de cada tramo con su vehículo; la cola de un turno de noche cuenta en el día
  // siguiente (00:00–fin) con el vehículo de la víspera.
  type Uso = { id: string; vehiculo: string; tramo: Tramo; desde: number; hasta: number };
  const visto = new Set<string>();
  for (const dia of DIAS_SEMANA) {
    const vispera = dia === 1 ? 7 : dia - 1;
    const usos: Uso[] = conductores.flatMap((c) => [
      ...c.semana.filter((d) => d.dia_semana === dia && d.vehiculo_id)
        .flatMap((d) => d.tramos.map((t) => ({ id: c.conductorId, vehiculo: d.vehiculo_id!, tramo: t, desde: minutos(t.inicio), hasta: finMinutos(t) }))),
      ...c.semana.filter((d) => d.dia_semana === vispera && d.vehiculo_id)
        .flatMap((d) => d.tramos.filter(esNocturno).map((t) => ({ id: c.conductorId, vehiculo: d.vehiculo_id!, tramo: t, desde: 0, hasta: minutos(t.fin) }))),
    ]);
    for (let i = 0; i < usos.length; i++) for (let j = i + 1; j < usos.length; j++) {
      const x = usos[i], y = usos[j];
      if (x.id === y.id || x.vehiculo !== y.vehiculo || !(x.desde < y.hasta && y.desde < x.hasta)) continue;
      const clave = `${dia}|${x.id}|${x.tramo.inicio}|${y.id}|${y.tramo.inicio}`;
      if (visto.has(clave)) continue;
      visto.add(clave);
      out.push({ vehiculoId: x.vehiculo, diaSemana: dia, a: x.id, b: y.id, tramoA: x.tramo, tramoB: y.tramo });
    }
  }
  return out;
}

/** Semana tipo con los 7 días (lunes a domingo) copiados de `origen`. */
export function copiarATodos<T extends DiaSemanaHorario>(semana: readonly T[], origen = 1): DiaSemanaHorario[] {
  const o = semana.find((d) => d.dia_semana === origen);
  return DIAS_SEMANA.map((dia) => {
    const actual = semana.find((d) => d.dia_semana === dia) ?? { dia_semana: dia, tramos: [], vehiculo_id: null, plantilla_id: null };
    if (!o) return { ...actual };
    return { dia_semana: dia, tramos: o.tramos.map((t) => ({ ...t })), vehiculo_id: o.vehiculo_id ?? null, plantilla_id: o.plantilla_id ?? null };
  });
}

/** Franjas para pintar un día de 24 h (en % del ancho), por hora de pared; el turno de noche se corta a las 24:00. */
export function segmentosDia(ts: readonly Tramo[]): { desde: number; hasta: number; tramo: Tramo }[] {
  return ordenar([...ts]).map((t) => ({ desde: (minutos(t.inicio) / 1440) * 100, hasta: (Math.min(finMinutos(t), 1440) / 1440) * 100, tramo: t }));
}
/** Huecos fuera de turno de un día (para sombrear): complementario de los tramos en [00:00, 24:00). */
export function fueraDeTurno(ts: readonly Tramo[]): Tramo[] {
  const out: Tramo[] = [];
  let m = 0;
  for (const t of ordenar([...ts])) { if (minutos(t.inicio) > m) out.push({ inicio: aHora(m), fin: t.inicio }); m = Math.max(m, Math.min(finMinutos(t), 1440)); }
  if (m < 1440) out.push({ inicio: aHora(m), fin: "24:00" });
  return out;
}

// ── Asignación a mano fuera de horario: se pregunta y queda registrado en el evento ──
export const PREFIJO_FUERA_HORARIO = "fuera_horario";
export const motivoAsignadoFueraHorario = (motivo: string) => `${PREFIJO_FUERA_HORARIO}: ${motivo}`;
export const preguntaAsignarFueraHorario = (motivo: string) => `${motivo}. ¿Asignar igualmente?`;

// ── Alertas a la central (vigilante) ──
export type TipoAlertaHorario = "fuera_horario" | "sin_jornada" | "fin_turno";
export interface AlertaHorario { tipo: TipoAlertaHorario; clave: string; texto: string; servicioId?: string | null }

/** Servicio asignado fuera del horario del conductor. null si cabe o no tiene horario. */
export function alertaFueraHorario(nombre: string, s: ServicioHorario & { id: string },
  h: HorarioConductor | null | undefined, o: { base?: Punto | null; agenda?: readonly { id?: string; inicio: number; fin: number }[] } = {}): AlertaHorario | null {
  const r = cabeServicio(h, s, o);
  if (r.cabe) return null;
  return { tipo: "fuera_horario", clave: s.id, servicioId: s.id, texto: `⚠️ Servicio de las ${hhmm(instante(s.inicio))} asignado a ${nombre} fuera de su horario · ${r.motivo}` };
}

/** Sin iniciar jornada 15 min después del inicio de su tramo (hasta 2 h después y antes del fin del tramo). */
export function alertaSinJornada(nombre: string, h: HorarioConductor | null | undefined, ahora: number,
  o: { jornadaAbierta: boolean; ausente?: boolean }): AlertaHorario | null {
  if (o.jornadaAbierta || o.ausente) return null;
  const fecha = diaMadrid(new Date(ahora));
  const ivs = intervalosDelDia(h, fecha);
  const iv = ivs?.find((i) => ahora >= i.inicio + GRACIA_SIN_JORNADA_MIN * MIN && ahora < Math.min(i.fin, i.inicio + VENTANA_SIN_JORNADA_MIN * MIN));
  if (!iv) return null;
  const tarde = Math.floor((ahora - iv.inicio) / MIN);
  return { tipo: "sin_jornada", clave: `${iv.fecha}|${iv.tramo.inicio}`,
    texto: `⏰ ${nombre} no ha iniciado la jornada: su turno empezó a las ${iv.tramo.inicio} (hace ${tarde} min)` };
}

export interface ServicioEnCurso { id: string; estado: string; inicio: number; duracionMin: number; destino: Punto | null }
const EN_CURSO = new Set(["en_camino", "recogido"]);
const POR_HACER = new Set(["asignado", "aceptado"]);
/**
 * Sigue en servicio más de 30 min pasado el fin de su turno (hasta 3 h) con servicios que no le dejan volver a la base a
 * tiempo: en curso (en camino / recogido) o asignados con la recogida antes de 1 h. null si no.
 */
export function alertaFinTurno(nombre: string, h: HorarioConductor | null | undefined, ahora: number,
  o: { servicios: readonly ServicioEnCurso[]; base?: Punto | null }): AlertaHorario | null {
  const fecha = diaMadrid(new Date(ahora));
  const hoy = intervalosDelDia(h, fecha);
  if (!hoy) return null;
  // También los tramos de ayer: un turno que acaba a las 23:30 se sigue vigilando pasada la medianoche.
  const ivs = [...(intervalosDelDia(h, sumarDias(fecha, -1)) ?? []), ...hoy]
    .filter((i, k, xs) => xs.findIndex((x) => x.fecha === i.fecha && x.tramo.inicio === i.tramo.inicio) === k).sort((a, b) => a.inicio - b.inicio);
  if (!ivs.length) return null;
  if (ivs.some((i) => i.inicio <= ahora && ahora < i.fin)) return null; // ya está en otro tramo
  const iv = [...ivs].reverse().find((i) => ahora >= i.fin + GRACIA_FIN_TURNO_MIN * MIN && ahora < i.fin + VENTANA_FIN_TURNO_MIN * MIN);
  if (!iv) return null;
  const activos = o.servicios.filter((s) => EN_CURSO.has(s.estado) || (POR_HACER.has(s.estado) && s.inicio <= ahora + 60 * MIN && s.inicio >= iv.inicio));
  if (!activos.length) return null;
  const vuelta = Math.max(...activos.map((s) => Math.max(s.inicio + s.duracionMin * MIN, ahora)
    + (o.base && s.destino ? (tiempoTraslado(s.destino, o.base) ?? 0) * MIN : 0)));
  if (vuelta <= iv.fin) return null;
  const pasado = Math.floor((ahora - iv.fin) / MIN);
  return { tipo: "fin_turno", clave: `${iv.fecha}|${iv.tramo.fin}`, servicioId: activos[0].id,
    texto: `🕒 ${nombre} sigue en servicio ${pasado} min después de su turno (fin ${iv.tramo.fin}) · vuelta a la base ≈ ${hhmm(vuelta)}` };
}

/** Recordatorios del conductor (app nativa): 5 min antes de cada tramo de hoy que aún no ha empezado. */
export function recordatoriosTurno(h: HorarioConductor | null | undefined, ahora: number): { id: string; cuando: number; tramo: Tramo }[] {
  const fecha = diaMadrid(new Date(ahora));
  return (intervalosDelDia(h, fecha) ?? []).filter((i) => i.fecha === fecha).map((i) => ({ id: `turno-${fecha}-${i.tramo.inicio.replace(":", "")}`, cuando: i.inicio - AVISO_ANTES_MIN * MIN, tramo: i.tramo }))
    .filter((r) => r.cuando > ahora);
}

/** «Tu horario de hoy: 08:00–13:00 · 16:00–20:00» (o «hoy libre»); null sin horario. */
export function textoHorarioHoy(h: HorarioConductor | null | undefined, fecha: string): string | null {
  const d = tramosDelDia(h, fecha);
  if (!d.restringido) return null;
  return d.tramos.length ? `Tu horario de hoy: ${textoTramos(d.tramos)}${d.nota ? ` (${d.nota})` : ""}` : `Hoy libre${d.nota ? ` (${d.nota})` : ""}`;
}
