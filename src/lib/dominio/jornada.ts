// Jornada laboral (registro horario, art. 34.9 ET). Lógica pura compartida por web, app nativa y central.
import { diaMadrid } from "./geo";
import { madridAUtc, sumarDias } from "./dias";
import { textoCsv } from "./csv";

export interface Pausa { inicio: string; fin: string | null }
export interface Jornada { id: string; conductor_id: string; inicio: string; fin: string | null; pausas: Pausa[] }
export type EstadoJornada = "fuera" | "trabajando" | "en_pausa";
export type AccionJornada = "iniciar" | "pausa" | "reanudar" | "finalizar";
export const ACCIONES_JORNADA: readonly AccionJornada[] = ["iniciar", "pausa", "reanudar", "finalizar"];

export function estadoJornada(abierta: Jornada | null | undefined): EstadoJornada {
  if (!abierta || abierta.fin) return "fuera";
  return abierta.pausas.some((p) => !p.fin) ? "en_pausa" : "trabajando";
}

/** Acciones válidas desde cada estado. */
export function accionesPermitidas(e: EstadoJornada): AccionJornada[] {
  if (e === "fuera") return ["iniciar"];
  if (e === "trabajando") return ["pausa", "finalizar"];
  return ["reanudar", "finalizar"];
}
export const accionValida = (e: EstadoJornada, a: AccionJornada) => accionesPermitidas(e).includes(a);

const solape = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Milisegundos de pausa de una jornada dentro de [desde, hasta). Las pausas abiertas cuentan hasta `ahora`. */
export function msPausa(j: Jornada, desde: number, hasta: number, ahora: number): number {
  const finJ = j.fin ? Date.parse(j.fin) : ahora;
  return j.pausas.reduce((s, p) => {
    const p0 = Date.parse(p.inicio), p1 = Math.min(p.fin ? Date.parse(p.fin) : ahora, finJ);
    return s + solape(p0, p1, desde, hasta);
  }, 0);
}

/** Milisegundos trabajados (jornada menos pausas) dentro de [desde, hasta). */
export function msTrabajados(jornadas: Jornada[], desde: number, hasta: number, ahora: number): number {
  return jornadas.reduce((s, j) => {
    const j0 = Date.parse(j.inicio), j1 = j.fin ? Date.parse(j.fin) : ahora;
    return s + Math.max(0, solape(j0, j1, desde, hasta) - msPausa(j, desde, hasta, ahora));
  }, 0);
}

/** Lunes (día Madrid «YYYY-MM-DD») de la semana del día dado. */
export function lunesDe(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((dow + 6) % 7));
}

/** Rangos UTC [desde, hasta) de hoy y de la semana (lunes–domingo) en Madrid. */
export function rangosJornada(ahora: Date) {
  const dia = diaMadrid(ahora);
  const lunes = lunesDe(dia);
  return {
    hoy: { desde: madridAUtc(dia, "00:00"), hasta: madridAUtc(sumarDias(dia, 1), "00:00") },
    semana: { desde: madridAUtc(lunes, "00:00"), hasta: madridAUtc(sumarDias(lunes, 7), "00:00") },
  };
}

export function resumenConductor(jornadas: Jornada[], ahora: Date) {
  const r = rangosJornada(ahora), t = ahora.getTime();
  const abierta = jornadas.find((j) => !j.fin) ?? null;
  return {
    estado: estadoJornada(abierta),
    abierta,
    msHoy: msTrabajados(jornadas, Date.parse(r.hoy.desde), Date.parse(r.hoy.hasta), t),
    msSemana: msTrabajados(jornadas, Date.parse(r.semana.desde), Date.parse(r.semana.hasta), t),
  };
}

/** «7 h 05 min». */
export function formatoDuracion(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export interface FilaRegistro {
  conductor_id: string; dia: string; entrada: string; salida: string | null;
  pausas: number; msPausa: number; msTrabajado: number;
}

/** Una fila por conductor y día (día de inicio de la jornada en Madrid), ordenadas por día y conductor. */
export function registroPorDia(jornadas: Jornada[], ahora: Date): FilaRegistro[] {
  const t = ahora.getTime();
  const mapa = new Map<string, FilaRegistro>();
  for (const j of jornadas) {
    const dia = diaMadrid(j.inicio);
    const k = `${j.conductor_id}|${dia}`;
    const j0 = Date.parse(j.inicio), j1 = j.fin ? Date.parse(j.fin) : t;
    const mp = msPausa(j, j0, j1, t);
    const f = mapa.get(k) ?? { conductor_id: j.conductor_id, dia, entrada: j.inicio, salida: j.fin, pausas: 0, msPausa: 0, msTrabajado: 0 };
    if (j.inicio < f.entrada) f.entrada = j.inicio;
    if (f.salida !== null) f.salida = j.fin === null ? null : (j.fin > f.salida ? j.fin : f.salida);
    f.pausas += j.pausas.length;
    f.msPausa += mp;
    f.msTrabajado += Math.max(0, j1 - j0 - mp);
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.conductor_id.localeCompare(b.conductor_id));
}

const horaMadrid = (iso: string) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const horasDec = (ms: number) => (ms / 3600e3).toFixed(2).replace(".", ",");

/** CSV (separador «;», compatible con Excel en español) del registro horario. */
export function csvRegistro(filas: FilaRegistro[], nombre: (id: string) => string): string {
  const cab = ["Conductor", "Fecha", "Entrada", "Salida", "Nº pausas", "Pausas (h)", "Horas trabajadas"];
  const lineas = filas.map((f) => [nombre(f.conductor_id), f.dia, horaMadrid(f.entrada), f.salida ? horaMadrid(f.salida) : "en curso",
    String(f.pausas), horasDec(f.msPausa), horasDec(f.msTrabajado)].map(textoCsv).join(";"));
  return "﻿" + [cab.join(";"), ...lineas].join("\r\n") + "\r\n";
}
