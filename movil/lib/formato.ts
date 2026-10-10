import type { EstadoServicio } from "@dominio/tipos";

const tz = { timeZone: "Europe/Madrid" } as const;
export const hora = new Intl.DateTimeFormat("es-ES", { ...tz, hour: "2-digit", minute: "2-digit" });
export const diaHora = new Intl.DateTimeFormat("es-ES", { ...tz, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fechaHora = new Intl.DateTimeFormat("es-ES", { ...tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fmt = (f: Intl.DateTimeFormat, iso: string) => f.format(new Date(iso));

export const ESTADO: Record<EstadoServicio, { texto: string; color: string }> = {
  pendiente: { texto: "Pendiente", color: "#fcd34d" },
  asignado: { texto: "Esperando respuesta", color: "#7dd3fc" },
  aceptado: { texto: "Aceptado", color: "#93c5fd" },
  en_camino: { texto: "En camino", color: "#c4b5fd" },
  recogido: { texto: "Con pasajeros", color: "#a5b4fc" },
  completado: { texto: "Completado", color: "#86efac" },
  cancelado: { texto: "Cancelado", color: "#94a3b8" },
  subcontratado: { texto: "Subcontratado", color: "#fdba74" },
};
