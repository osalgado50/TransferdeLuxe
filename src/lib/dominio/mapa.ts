import type { PosicionActual, Servicio } from "./tipos";
export type EstadoVehiculoMapa = "libre" | "en_camino" | "con_pasajeros" | "sin_senal";
export function estadoEnMapa(pos: PosicionActual | undefined, activo: Pick<Servicio, "estado"> | undefined, ahora: Date, umbralMin: number): EstadoVehiculoMapa {
  if (!pos || !pos.en_servicio || ahora.getTime() - new Date(pos.registrado_en).getTime() > umbralMin * 60_000) return "sin_senal";
  if (activo?.estado === "recogido") return "con_pasajeros";
  if (activo?.estado === "en_camino") return "en_camino";
  return "libre";
}
