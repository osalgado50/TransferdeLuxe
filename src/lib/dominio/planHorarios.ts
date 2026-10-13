import { sumarDias } from "./dias";
import { diaMadrid } from "./geo";
import { DIAS_SEMANA, intervalo, tramosDelDia, type DiaSemanaHorario, type HorarioConductor, type Tramo } from "./horarios";

/**
 * Planificación de horarios por fechas (lógica pura): semanas, meses o todo el año por encima de la semana tipo.
 *
 * - Cada día planificado es una fila con fecha (tipo «plan») que manda sobre la semana tipo; los «cambios» puntuales
 *   (médico, cambio con un compañero) también mandan, pero no se copian ni se pisan al copiar o repetir.
 * - Copiar un mes al siguiente respeta el día de la semana: cada día toma el de 4 semanas antes (5 si 4 semanas antes
 *   aún cae en el mes nuevo). Repetir semanas copia un bloque de N semanas (rotación mañanas/tardes…) hasta una fecha.
 */
export interface DiaPlan { fecha: string; tramos: Tramo[]; vehiculo_id: string | null }

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const esMes = (m: string) => MES.test(m);
/** «2026-10» → «2026-11». */
export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
/** Días «YYYY-MM-DD» del mes. */
export function diasDelMes(mes: string): string[] {
  const out: string[] = [];
  for (let d = `${mes}-01`; d.startsWith(mes); d = sumarDias(d, 1)) out.push(d);
  return out;
}
/** Meses de `desde` a `hasta` (ambos incluidos). */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let m = desde; m <= hasta && out.length < 36; m = mesSiguiente(m)) out.push(m);
  return out;
}
const fmtMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
/** «octubre de 2026». */
export const nombreMes = (mes: string) => fmtMes.format(new Date(`${mes}-15T12:00:00Z`));

/** Día del mes anterior del que se copia `dia` (mismo día de la semana: 4 semanas antes, o 5 si aún cae en su mes). */
export function origenCopiaMes(dia: string): string {
  const mes = dia.slice(0, 7);
  const a4 = sumarDias(dia, -28);
  return a4.startsWith(mes) ? sumarDias(dia, -35) : a4;
}

/** Horario de un día para copiarlo (sin los cambios puntuales); null si ese día no tiene horario (disponible todo el día). */
function diaParaCopiar(h: HorarioConductor | null | undefined, fecha: string): Omit<DiaPlan, "fecha"> | null {
  const d = tramosDelDia(h, fecha, { sinCambios: true });
  if (!d.restringido) return null;
  return { tramos: d.tramos.map((t) => ({ ...t })), vehiculo_id: d.vehiculoId };
}
/** Días con un cambio puntual (no se pisan). */
const conCambio = (h: HorarioConductor | null | undefined) => new Set((h?.excepciones ?? []).filter((e) => e.tipo !== "plan").map((e) => e.fecha));

/** Añade (o sustituye) días planificados en una copia del horario (para encadenar meses). */
export function conPlan(h: HorarioConductor | null | undefined, dias: readonly DiaPlan[]): HorarioConductor {
  const nuevos = new Map(dias.map((d) => [d.fecha, d]));
  return {
    semana: h?.semana ?? [],
    excepciones: [
      ...(h?.excepciones ?? []).filter((e) => !nuevos.has(e.fecha)),
      ...dias.map((d) => ({ fecha: d.fecha, tramos: d.tramos, nota: null, vehiculo_id: d.vehiculo_id, tipo: "plan" as const })),
    ],
  };
}

/**
 * Días del mes siguiente a `mesOrigen` copiados de él (mismo día de la semana). No toca los días con cambio puntual ni
 * los que en el origen no tienen horario.
 */
export function planCopiarMes(h: HorarioConductor | null | undefined, mesOrigen: string): DiaPlan[] {
  const cambio = conCambio(h);
  return diasDelMes(mesSiguiente(mesOrigen)).flatMap((fecha) => {
    if (cambio.has(fecha)) return [];
    const d = diaParaCopiar(h, origenCopiaMes(fecha));
    return d ? [{ fecha, ...d }] : [];
  });
}

/** Copia `mesOrigen` a los meses siguientes hasta `mesHasta` (encadenado: cada mes sale del anterior ya copiado). */
export function planCopiarMeses(h: HorarioConductor | null | undefined, mesOrigen: string, mesHasta: string): DiaPlan[] {
  let actual: HorarioConductor = conPlan(h, []);
  const out: DiaPlan[] = [];
  for (let m = mesOrigen; mesSiguiente(m) <= mesHasta && out.length < 1000; m = mesSiguiente(m)) {
    const dias = planCopiarMes(actual, m);
    out.push(...dias);
    actual = conPlan(actual, dias);
  }
  return out;
}

/**
 * Repite el bloque de `semanas` semanas que empieza el lunes `lunes` hasta `hasta` (incluido): rotaciones como
 * «semana de mañanas, semana de tardes». No toca los días con cambio puntual.
 */
export function planRepetirSemanas(h: HorarioConductor | null | undefined, lunes: string, semanas: number, hasta: string): DiaPlan[] {
  const n = Math.max(1, Math.min(8, Math.floor(semanas))) * 7;
  const cambio = conCambio(h);
  const patron = Array.from({ length: n }, (_, i) => diaParaCopiar(h, sumarDias(lunes, i)));
  const out: DiaPlan[] = [];
  for (let i = n, fecha = sumarDias(lunes, n); fecha <= hasta && out.length < 1000; i++, fecha = sumarDias(fecha, 1)) {
    const d = patron[i % n];
    if (d && !cambio.has(fecha)) out.push({ fecha, tramos: d.tramos.map((t) => ({ ...t })), vehiculo_id: d.vehiculo_id });
  }
  return out;
}

/** Los 7 días de la semana tipo convertidos en días planificados de la semana que empieza el lunes `lunes`. */
export function planSemana(lunes: string, dias: readonly DiaSemanaHorario[]): DiaPlan[] {
  return DIAS_SEMANA.map((dia, i) => {
    const d = dias.find((x) => x.dia_semana === dia);
    return { fecha: sumarDias(lunes, i), tramos: (d?.tramos ?? []).map((t) => ({ ...t })), vehiculo_id: d?.vehiculo_id ?? null };
  });
}

export interface SolapeFecha { fecha: string; vehiculoId: string; a: string; b: string; tramoA: Tramo; tramoB: Tramo }
/**
 * Mismo vehículo del turno para dos conductores a la vez en alguno de esos días (con lo planificado y la madrugada de
 * los turnos de noche). Terminar uno a las 15:00 y empezar otro a las 15:00 es el relevo en la base: no se solapan.
 */
export function solapesVehiculoFechas(horarios: ReadonlyMap<string, HorarioConductor>, fechas: readonly string[]): SolapeFecha[] {
  if (!fechas.length) return [];
  const dentro = new Set(fechas);
  // Tramos propios de cada día (y de la víspera del primero, por la madrugada de los turnos de noche) con su vehículo.
  const dias = [sumarDias(fechas[0], -1), ...fechas];
  const usos = [...horarios].flatMap(([id, h]) => dias.flatMap((fecha) => {
    const d = tramosDelDia(h, fecha);
    return d.restringido && d.vehiculoId ? d.tramos.map((tr) => ({ id, vehiculo: d.vehiculoId!, iv: intervalo(fecha, tr) })) : [];
  }));
  const out: SolapeFecha[] = [];
  for (let i = 0; i < usos.length; i++) for (let j = i + 1; j < usos.length; j++) {
    const x = usos[i], y = usos[j];
    if (x.id === y.id || x.vehiculo !== y.vehiculo || !(x.iv.inicio < y.iv.fin && y.iv.inicio < x.iv.fin)) continue;
    const fecha = diaMadrid(new Date(Math.max(x.iv.inicio, y.iv.inicio))); // día en que empieza a la vez
    if (dentro.has(fecha)) out.push({ fecha, vehiculoId: x.vehiculo, a: x.id, b: y.id, tramoA: x.iv.tramo, tramoB: y.iv.tramo });
  }
  return out.sort((p, q) => p.fecha.localeCompare(q.fecha));
}
