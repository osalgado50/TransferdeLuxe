// ¿Está el conductor conectado? En línea = interruptor GPS «En servicio» activo y última posición dentro del umbral
// «sin señal» de los ajustes. Lo usan la central web y el modo central de la app al asignar/reasignar.

export type EstadoConexion = "en_linea" | "sin_senal" | "fuera";
export interface Conexion { estado: EstadoConexion; minutos: number | null; texto: string }

export function conexionConductor(
  pos: { en_servicio: boolean; registrado_en: string } | undefined, ahora: Date, umbralMin: number,
): Conexion {
  if (!pos) return { estado: "fuera", minutos: null, texto: "Sin GPS · nunca conectado" };
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(pos.registrado_en).getTime()) / 60_000));
  const hace = minutos < 1 ? "ahora" : minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`;
  if (!pos.en_servicio) return { estado: "fuera", minutos, texto: `Fuera de servicio · ${hace}` };
  if (minutos >= umbralMin) return { estado: "sin_senal", minutos, texto: `Sin señal · última posición ${hace}` };
  return { estado: "en_linea", minutos, texto: `En línea · GPS ${hace}` };
}

export const COLOR_CONEXION: Record<EstadoConexion, string> = { en_linea: "#22c55e", sin_senal: "#ef4444", fuera: "#94a3b8" };
