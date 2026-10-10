import { sumarDias } from "@/lib/dominio/periodo";

const fmtHM = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Minutos desde las 00:00 de Madrid de la fecha dada. */
export function minutosMadrid(fecha: string): number {
  const p = fmtHM.formatToParts(new Date(fecha));
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return n("hour") * 60 + n("minute");
}

export interface Bloque<T> {
  servicio: T;
  /** Minutos desde la hora de inicio de la rejilla (0 en madrugada). */
  top: number;
  /** Alto en minutos, recortado a las 24:00. */
  height: number;
  col: number;
  cols: number;
  /** Servicio anterior a horaInicio: va a la franja «Madrugada». */
  madrugada: boolean;
}

const DUR_MIN = 15;

/** Coloca los servicios de un día en la rejilla; los solapados se reparten en columnas. */
export function posicionarDia<T extends { fecha_hora_recogida: string; duracion_estimada_min: number }>(servicios: T[], horaInicio = 6): Bloque<T>[] {
  const base = horaInicio * 60;
  const items = servicios.map((servicio) => {
    const ini = minutosMadrid(servicio.fecha_hora_recogida);
    const dur = Math.max(DUR_MIN, servicio.duracion_estimada_min || DUR_MIN);
    return { servicio, ini, fin: Math.min(1440, ini + dur), madrugada: ini < base };
  }).sort((a, b) => a.ini - b.ini || b.fin - a.fin);

  const salida: Bloque<T>[] = [];
  let grupo: { it: (typeof items)[number]; col: number }[] = [];
  let finGrupo = -1, nCols = 0;
  const cerrar = () => {
    for (const g of grupo) salida.push({ servicio: g.it.servicio, top: g.it.ini - base, height: g.it.fin - g.it.ini, col: g.col, cols: nCols, madrugada: false });
    grupo = []; nCols = 0; finGrupo = -1;
  };
  let colFin: number[] = [];
  for (const it of items) {
    if (it.madrugada) { salida.push({ servicio: it.servicio, top: 0, height: 0, col: 0, cols: 1, madrugada: true }); continue; }
    if (grupo.length && it.ini >= finGrupo) { cerrar(); colFin = []; }
    let col = colFin.findIndex((f) => f <= it.ini);
    if (col < 0) { col = colFin.length; colFin.push(it.fin); } else colFin[col] = it.fin;
    nCols = Math.max(nCols, colFin.length);
    finGrupo = Math.max(finGrupo, it.fin);
    grupo.push({ it, col });
  }
  cerrar();
  return salida;
}

export interface CeldaMes { dia: string; enMes: boolean }

/** Rejilla del mes (lunes primero): 35 o 42 celdas. */
export function celdasMes(desde: string): CeldaMes[] {
  const primero = `${desde.slice(0, 8)}01`;
  const d = new Date(`${primero}T00:00:00Z`);
  const dias = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const desfase = (d.getUTCDay() + 6) % 7;
  const total = Math.ceil((desfase + dias) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const dia = sumarDias(primero, i - desfase);
    return { dia, enMes: dia.slice(0, 7) === primero.slice(0, 7) };
  });
}
