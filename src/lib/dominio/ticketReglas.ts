// Reglas del ticket de combustible compartidas por la web, la app nativa y el servidor (días de Madrid, no UTC).
import { diaMadrid } from "./geo";
import { sumarDias } from "./dias";

/** Un ticket más antiguo que esto no se acepta (fotos viejas, tickets de otro año mal leídos…). */
export const DIAS_MAX_TICKET = 60;
/** Un ticket de hoy o de los 2 días anteriores es «reciente»: compara y actualiza los km del vehículo. */
export const DIAS_RECIENTE = 2;
/** Más km que esto desde el último registro: ¿seguro? (solo aviso). */
export const SALTO_RARO_KM = 3000;

/** «1.000» (sin depender de Intl: Hermes y es-ES no agrupan igual los números de 4 cifras). */
export const fmtKm = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmtDia = (d: string) => d.split("-").reverse().join("/");

export const hoyMadrid = (ahora: Date = new Date()) => diaMadrid(ahora);

/** Error de la fecha de un ticket («YYYY-MM-DD») o null si vale: ni futura ni de hace más de 60 días. */
export function errorFechaTicket(fecha: string, ahora: Date = new Date()): string | null {
  const f = fecha.trim();
  const t = new Date(`${f}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== f) return "La fecha no es válida: usa el formato AAAA-MM-DD.";
  const hoy = hoyMadrid(ahora);
  if (f > hoy) return "La fecha del ticket no puede ser futura.";
  const limite = sumarDias(hoy, -DIAS_MAX_TICKET);
  if (f < limite) return `El ticket es del ${fmtDia(f)}: solo se aceptan tickets de los últimos ${DIAS_MAX_TICKET} días (desde el ${fmtDia(limite)}). Revisa la fecha.`;
  return null;
}

/** Ticket de hoy o de los 2 días anteriores (Madrid): solo estos suben los km del vehículo. */
export function ticketReciente(fecha: string, ahora: Date = new Date()): boolean {
  return fecha.trim() >= sumarDias(hoyMadrid(ahora), -DIAS_RECIENTE);
}

/** Aviso de km en el formulario: menos que los últimos del coche (no se puede guardar) o un salto muy grande (¿seguro?). */
export function avisoKm(km: string, fecha: string, ultimo: { matricula: string; km: number } | null, ahora: Date = new Date()): { texto: string; error: boolean } | null {
  if (!ultimo || !/^\d+$/.test(km.trim())) return null;
  const n = Number(km.trim());
  if (ticketReciente(fecha, ahora) && n < ultimo.km) return { texto: `Son menos km que los últimos registrados de ${ultimo.matricula} (${fmtKm(ultimo.km)} km): el cuentakilómetros no baja.`, error: true };
  if (n - ultimo.km > SALTO_RARO_KM) return { texto: `Son ${fmtKm(n - ultimo.km)} km más que el último registro (${fmtKm(ultimo.km)} km): ¿seguro?`, error: false };
  return null;
}
