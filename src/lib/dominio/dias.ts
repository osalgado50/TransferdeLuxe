import { diaMadrid } from "./geo";

const partes = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
/** Diferencia (ms) entre la hora de pared de Madrid y UTC en el instante t. Sin reparsear cadenas (Hermes no lo admite). */
function desfaseMadrid(t: number): number {
  const p = Object.fromEntries(partes.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** «YYYY-MM-DDTHH:MM» de pared en Madrid del instante t. */
function paredMadrid(t: number): string {
  const p = Object.fromEntries(partes.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, "0")}:${p.minute}`;
}

/**
 * Hora local de Madrid («YYYY-MM-DD», «HH:MM») → instante UTC ISO. Se prueban los dos desfases posibles del día (el de
 * 12 h antes y el de 12 h después) y se queda el que da esa hora de pared: antes se medía el desfase en la hora leída
 * como UTC y las 01:00–01:59 de los días de cambio de hora salían 1 h mal (el 25/10 a las 01:30 se guardaba como las
 * 02:30). Hora repetida (otoño, 02:00–02:59): la primera vez. Hora que no existe (primavera, 02:00–02:59): una hora más.
 */
export function madridAUtc(fecha: string, hora: string): string {
  const guess = Date.parse(`${fecha}T${hora}:00Z`);
  const candidatos = [guess - desfaseMadrid(guess - 12 * 3600e3), guess - desfaseMadrid(guess + 12 * 3600e3)];
  const validos = candidatos.filter((t) => paredMadrid(t) === `${fecha}T${hora}`);
  return new Date(validos.length ? Math.min(...validos) : candidatos[0]).toISOString();
}

/** Día de Madrid desplazado n días (n puede ser negativo). */
export function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
}

export interface RangosConductor {
  /** [desde, hasta) de hoy en Madrid. */
  hoy: { desde: string; hasta: string };
  /** [desde, hasta) de los 7 días siguientes a hoy. */
  proximos: { desde: string; hasta: string };
  /** Inicio de los últimos 7 días (hoy incluido) y su día «YYYY-MM-DD». */
  historial: { desde: string; desdeDia: string };
}

/** Rangos de fechas que usan las pantallas del conductor (mismos que la web). */
export function rangosConductor(ahora: Date): RangosConductor {
  const dia = diaMadrid(ahora);
  const manana = madridAUtc(sumarDias(dia, 1), "00:00");
  const desdeDia = sumarDias(dia, -6);
  return {
    hoy: { desde: madridAUtc(dia, "00:00"), hasta: manana },
    proximos: { desde: manana, hasta: madridAUtc(sumarDias(dia, 8), "00:00") },
    historial: { desde: madridAUtc(desdeDia, "00:00"), desdeDia },
  };
}
