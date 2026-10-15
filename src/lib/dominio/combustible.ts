export interface TicketCalculo { vehiculoId: string; fecha: string; litros: number; importe: number; km: number }
const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenCombustible(t: TicketCalculo[]) {
  return { gasto: r2(t.reduce((a, x) => a + x.importe, 0)), litros: r2(t.reduce((a, x) => a + x.litros, 0)), tickets: t.length };
}

/** Consumo plausible de un turismo/furgoneta: fuera de esto el tramo es un error de km o un repostaje parcial raro. */
export const L100_MIN = 3;
export const L100_MAX = 30;

export interface TramoConsumo<T> { desde: T; hasta: T; km: number; litros: number; l100: number }

/**
 * Tramos entre repostajes de UN vehículo: tickets por fecha y luego km; cada ticket se compara con el inmediatamente
 * anterior (por fecha, no el de más km). Los litros del ticket son lo gastado desde el anterior. Se descartan los tramos
 * con km que no suben (ticket atrasado o mal leído) y los de consumo imposible (< 3 o > 30 L/100 km), en vez de meterlos
 * en la media.
 */
export function tramosConsumo<T extends { fecha: string; km: number; litros: number }>(t: T[]): TramoConsumo<T>[] {
  const o = [...t].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.km - b.km);
  const tramos: TramoConsumo<T>[] = [];
  for (let i = 1; i < o.length; i++) {
    const km = o[i].km - o[i - 1].km;
    if (!(km > 0)) continue;
    const l100 = (o[i].litros / km) * 100;
    if (!(l100 >= L100_MIN && l100 <= L100_MAX)) continue;
    tramos.push({ desde: o[i - 1], hasta: o[i], km, litros: o[i].litros, l100 });
  }
  return tramos;
}

/**
 * Consumo medio (L/100 km, 1 decimal) de UN vehículo: litros de los tramos válidos / km de esos tramos. `incluir` elige
 * qué tramos cuentan según su ticket final (p. ej. solo los del mes o de un conductor); el ticket de partida puede ser
 * anterior. Null si no queda ningún tramo válido.
 */
export function consumoMedioL100<T extends { fecha: string; km: number; litros: number }>(t: T[], incluir?: (hasta: T) => boolean): number | null {
  const tramos = tramosConsumo(t).filter((x) => !incluir || incluir(x.hasta));
  const km = tramos.reduce((a, x) => a + x.km, 0);
  if (km <= 0) return null;
  const litros = tramos.reduce((a, x) => a + x.litros, 0);
  return Math.round((litros / km) * 1000) / 10;
}

export function gastoPorMes(t: TicketCalculo[]) {
  const m = new Map<string, { gasto: number; litros: number }>();
  for (const x of t) {
    const k = x.fecha.slice(0, 7);
    const v = m.get(k) ?? { gasto: 0, litros: 0 };
    v.gasto += x.importe; v.litros += x.litros; m.set(k, v);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, gasto: r2(v.gasto), litros: r2(v.litros) }));
}

/** Tickets para calcular el consumo: todos los del vehículo (sin filtro de conductor ni cota inferior de mes);
 *  si hay mes, solo hasta el final de ese mes. */
export function ticketsParaConsumo<T extends { fecha: string }>(todos: T[], { mes }: { mes?: string | null } = {}): T[] {
  return mes ? todos.filter((t) => t.fecha.slice(0, 7) <= mes) : [...todos];
}

/** Ticket de partida para el consumo de un mes: el último por fecha (y km) anterior al mes, no el de más km. */
export function previoAlMes<T extends { fecha: string; km: number }>(t: T[], mes: string): T | undefined {
  return t.filter((x) => x.fecha < `${mes}-01`).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.km - a.km)[0];
}

/** Meses «YYYY-MM» de `hasta` hacia atrás hasta `desde` (ambos incluidos), para el selector de mes. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = hasta.split("-").map(Number);
  const [y0, m0] = desde.split("-").map(Number);
  while ((y > y0 || (y === y0 && m >= m0)) && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}
