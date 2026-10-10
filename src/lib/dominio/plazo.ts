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
