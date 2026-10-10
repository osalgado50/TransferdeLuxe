import { madridAUtc } from "@/lib/reserva/esquema";
import { diaMadrid } from "@/lib/dominio/geo";

export type Vista = "dia" | "semana" | "mes";
export const VISTAS: Vista[] = ["dia", "semana", "mes"];
export const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha YYYY-MM-DD válida de calendario (rechaza 2026-02-31). */
export function diaValido(s: string | undefined | null): s is string {
  if (!s || !RE_DIA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Suma días a un YYYY-MM-DD (calendario puro, sin zonas horarias). */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lunesDe(dia: string): string {
  const dow = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((dow + 6) % 7));
}

function sumarMeses(primero: string, n: number): string {
  const d = new Date(`${primero.slice(0, 8)}01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", ...opts });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface RangoPeriodo { desdeUtc: string; hastaUtc: string; etiqueta: string; anterior: string; siguiente: string; inicio: string; fin: string }

/** Rango [desdeUtc, hastaUtc) de un periodo en horario de Madrid. `anterior`/`siguiente` son el `desde` del periodo contiguo. */
export function rangoPeriodo(vista: Vista, desde: string): RangoPeriodo {
  let inicio: string, finExcl: string, anterior: string, siguiente: string, etiqueta: string;
  if (vista === "dia") {
    inicio = desde; finExcl = sumarDias(desde, 1); anterior = sumarDias(desde, -1); siguiente = finExcl;
    etiqueta = cap(fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${desde}T00:00:00Z`)));
  } else if (vista === "semana") {
    inicio = lunesDe(desde); finExcl = sumarDias(inicio, 7); anterior = sumarDias(inicio, -7); siguiente = finExcl;
    const f = (d: string) => fmt({ day: "numeric", month: "short" }).format(new Date(`${d}T00:00:00Z`));
    etiqueta = `${f(inicio)} – ${f(sumarDias(inicio, 6))} ${sumarDias(inicio, 6).slice(0, 4)}`;
  } else {
    inicio = `${desde.slice(0, 8)}01`; finExcl = sumarMeses(inicio, 1); anterior = sumarMeses(inicio, -1); siguiente = finExcl;
    etiqueta = cap(fmt({ month: "long", year: "numeric" }).format(new Date(`${inicio}T00:00:00Z`)));
  }
  return {
    desdeUtc: madridAUtc(inicio, "00:00"), hastaUtc: madridAUtc(finExcl, "00:00"),
    etiqueta, anterior, siguiente, inicio, fin: sumarDias(finExcl, -1),
  };
}

/** Atajos relativos a «hoy» (Madrid). */
export function atajos(hoy: string = diaMadrid(new Date())) {
  return {
    hoy: { vista: "dia" as Vista, desde: hoy },
    manana: { vista: "dia" as Vista, desde: sumarDias(hoy, 1) },
    pasado: { vista: "dia" as Vista, desde: sumarDias(hoy, 2) },
    semana: { vista: "semana" as Vista, desde: hoy },
    mes: { vista: "mes" as Vista, desde: hoy },
  };
}

export interface GrupoDia<T> { dia: string; titulo: string; servicios: T[] }

/** Agrupa por día Madrid, ordenado por hora; título «Lunes 13/10 · 4 servicios». */
export function agruparPorDia<T extends { fecha_hora_recogida: string }>(servicios: T[]): GrupoDia<T>[] {
  const orden = [...servicios].sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
  const mapa = new Map<string, T[]>();
  for (const s of orden) {
    const d = diaMadrid(s.fecha_hora_recogida);
    (mapa.get(d) ?? mapa.set(d, []).get(d)!).push(s);
  }
  return [...mapa.entries()].map(([dia, lista]) => {
    const dt = new Date(`${dia}T00:00:00Z`);
    const sem = cap(fmt({ weekday: "long" }).format(dt));
    const ddmm = fmt({ day: "2-digit", month: "2-digit" }).format(dt);
    return { dia, titulo: `${sem} ${ddmm} · ${lista.length} ${lista.length === 1 ? "servicio" : "servicios"}`, servicios: lista };
  });
}

export interface Contadores { pendientes: number; esperando: number; enCurso: number; completados: number; subcontratar: number; cancelados: number }

export function contar(filas: { estado: string; subcontratar: boolean }[]): Contadores {
  const c: Contadores = { pendientes: 0, esperando: 0, enCurso: 0, completados: 0, subcontratar: 0, cancelados: 0 };
  for (const s of filas) {
    if (s.estado === "pendiente") c.pendientes++;
    else if (s.estado === "asignado") c.esperando++;
    else if (["aceptado", "en_camino", "recogido"].includes(s.estado)) c.enCurso++;
    else if (s.estado === "completado") c.completados++;
    else if (s.estado === "cancelado") c.cancelados++;
    if (s.subcontratar && s.estado !== "cancelado" && s.estado !== "completado") c.subcontratar++;
  }
  return c;
}
