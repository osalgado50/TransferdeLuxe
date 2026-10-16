export function segundosRestantes(asignadoEn: string, plazoMin: number, ahora: Date): number {
  return Math.max(0, Math.floor((new Date(asignadoEn).getTime() + plazoMin * 60_000 - ahora.getTime()) / 1000));
}

export function claveAsignacion(s: { id: string; asignado_en: string | null }): string {
  return s.id + "|" + (s.asignado_en ? new Date(s.asignado_en).getTime() : "");
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** Cuenta atrás para responder: h:mm:ss / m:ss, o «Sin límite de respuesta» si quedan más de 24 h. */
export function formatoCuenta(s: number): string {
  if (s > 86400) return "Sin límite de respuesta";
  if (s > 3600) return `${Math.floor(s / 3600)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
  return `${Math.floor(s / 60)}:${p2(s % 60)}`;
}

/** Una asignación cuya recogida pasó hace más de esto ya no se ofrece como «Servicio nuevo» (la central la ve en «Atrasados»). */
export const NUEVO_CADUCA_MS = 6 * 3600e3;
type Asignable = { id: string; estado: string; conductor_id: string | null; asignado_en: string | null; fecha_hora_recogida: string };
/**
 * Qué «Servicio nuevo» enseñar primero: el de recogida más próxima (lo urgente delante). Antes salía el asignado hace
 * más tiempo, así que unas asignaciones viejas sin responder tapaban la de ahora y el conductor no podía atenderla.
 * Las de recogida ya muy pasada no se ofrecen.
 */
export function siguienteNuevo<T extends Asignable>(lista: readonly T[], yo: string, ocultos: ReadonlySet<string>, ahora: Date): T | undefined {
  const limite = ahora.getTime() - NUEVO_CADUCA_MS;
  return lista
    .filter((x) => x.conductor_id === yo && x.estado === "asignado" && x.asignado_en && !ocultos.has(claveAsignacion(x)) && Date.parse(x.fecha_hora_recogida) >= limite)
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida) || a.asignado_en!.localeCompare(b.asignado_en!))[0];
}
