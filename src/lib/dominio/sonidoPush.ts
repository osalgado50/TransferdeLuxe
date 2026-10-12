// Sonido propio de cada notificación (ficheros en movil/assets/sonidos, incluidos en la app nativa).
// En Android el sonido va ligado al canal (los canales no se pueden cambiar una vez creados): un canal por sonido.

export type SonidoPush = "servicio_nuevo" | "alarma" | "aviso" | "aceptado";
export const SONIDOS_PUSH: readonly SonidoPush[] = ["servicio_nuevo", "alarma", "aviso", "aceptado"];
export const NOMBRE_CANAL: Record<SonidoPush, string> = {
  servicio_nuevo: "Servicios nuevos", alarma: "Alarmas (averías y accidentes)", aviso: "Avisos (retrasos, rechazos)", aceptado: "Confirmaciones",
};

const AVISOS = new Set(["rechazado", "expirado", "retraso", "retraso_recogida", "no_presentado", "checklist", "deshecho", "servicio_retirado"]);

/** Qué sonido corresponde a un aviso según su tipo (y si es grave). null = sonido normal del sistema. */
export function sonidoDeAviso(d: { tipo?: string; grave?: boolean } | undefined): SonidoPush | null {
  if (!d?.tipo) return null;
  if (d.grave || d.tipo === "accidente" || d.tipo === "averia") return "alarma";
  if (d.tipo === "servicio_nuevo" || d.tipo === "reserva_nueva" || d.tipo === "recogida_reajustada") return "servicio_nuevo";
  if (d.tipo === "aceptado") return "aceptado";
  if (AVISOS.has(d.tipo) || d.tipo === "incidencia") return "aviso";
  return null;
}

/** Campos para el mensaje push de Expo: fichero de sonido (iOS) y canal (Android). */
export function camposSonidoPush(d: { tipo?: string; grave?: boolean } | undefined): { sound: string; channelId: string } {
  const s = sonidoDeAviso(d);
  return s ? { sound: `${s}.wav`, channelId: s } : { sound: "default", channelId: "servicios" };
}
