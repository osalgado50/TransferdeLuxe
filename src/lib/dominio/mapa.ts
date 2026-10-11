import type { PosicionActual, Servicio } from "./tipos";
export type EstadoVehiculoMapa = "libre" | "en_camino" | "con_pasajeros" | "sin_senal";
export function estadoEnMapa(pos: PosicionActual | undefined, activo: Pick<Servicio, "estado"> | undefined, ahora: Date, umbralMin: number): EstadoVehiculoMapa {
  if (!pos || !pos.en_servicio || ahora.getTime() - new Date(pos.registrado_en).getTime() > umbralMin * 60_000) return "sin_senal";
  if (activo?.estado === "recogido") return "con_pasajeros";
  if (activo?.estado === "en_camino") return "en_camino";
  return "libre";
}

export const COLOR_ESTADO_MAPA: Record<EstadoVehiculoMapa, string> = { libre: "#16a34a", en_camino: "#7c3aed", con_pasajeros: "#4338ca", sin_senal: "#9ca3af" };
export const TEXTO_ESTADO_MAPA: Record<EstadoVehiculoMapa, string> = { libre: "Libre", en_camino: "En camino", con_pasajeros: "Con pasajeros", sin_senal: "Sin señal" };
const ACTIVOS_MAPA = ["asignado", "aceptado", "en_camino", "recogido"];

export interface MarcadorFlota { conductorId: string; nombre: string; lat: number; lng: number; estado: EstadoVehiculoMapa; color: string; texto: string; minutos: number }

/** Un marcador por posición conocida, con el estado del servicio en curso (mismo criterio que el mapa de la web). */
export function marcadoresFlota(posiciones: PosicionActual[], servicios: Pick<Servicio, "conductor_id" | "estado" | "fecha_hora_recogida">[],
  conductores: { id: string; nombre: string }[], ahora: Date, umbralMin: number): MarcadorFlota[] {
  return posiciones.map((p) => {
    const actual = servicios.find((s) => s.conductor_id === p.conductor_id && ACTIVOS_MAPA.includes(s.estado) && (s.estado === "en_camino" || s.estado === "recogido"));
    const estado = estadoEnMapa(p, actual, ahora, umbralMin);
    return {
      conductorId: p.conductor_id, nombre: conductores.find((c) => c.id === p.conductor_id)?.nombre ?? "Conductor", lat: p.lat, lng: p.lng,
      estado, color: COLOR_ESTADO_MAPA[estado], texto: TEXTO_ESTADO_MAPA[estado],
      minutos: Math.max(0, Math.round((ahora.getTime() - new Date(p.registrado_en).getTime()) / 60_000)),
    };
  });
}
