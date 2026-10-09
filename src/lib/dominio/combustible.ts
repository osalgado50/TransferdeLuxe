export interface TicketCalculo { vehiculoId: string; fecha: string; litros: number; importe: number; km: number }
const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenCombustible(t: TicketCalculo[]) {
  return { gasto: r2(t.reduce((a, x) => a + x.importe, 0)), litros: r2(t.reduce((a, x) => a + x.litros, 0)), tickets: t.length };
}

export function consumoMedioL100(t: TicketCalculo[]): number | null {
  if (t.length < 2) return null;
  const o = [...t].sort((a, b) => a.km - b.km);
  const km = o[o.length - 1].km - o[0].km;
  if (km <= 0) return null;
  const litros = o.slice(1).reduce((a, x) => a + x.litros, 0);
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
