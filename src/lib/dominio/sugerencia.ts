import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";

export interface ServicioParaSugerir { id: string; inicio: Date; duracionMin: number; pasajeros: number; maletas: number; origen: Punto | null }
export interface TramoAgenda { servicioId: string; inicio: Date; fin: Date; destino: Punto | null }
export interface Candidato {
  conductorId: string; nombre: string;
  vehiculo: { id: string; plazas: number; maletas: number; estado: "activo" | "taller" } | null;
  posicion: { punto: Punto; registradoEn: Date } | null;
  agenda: TramoAgenda[];
}
export interface Sugerencia { conductorId: string; nombre: string; apto: boolean; motivos: string[]; distanciaKm: number | null }

const MIN = 60_000;
const VENTANA_GPS_MIN = 60;
const GPS_VALIDO_MIN = 5;
const redondear = (km: number) => Math.round(km * 10) / 10;

export function sugerirConductores(s: ServicioParaSugerir, candidatos: Candidato[], ahora: Date): Sugerencia[] {
  const fin = new Date(s.inicio.getTime() + s.duracionMin * MIN);
  const inminente = s.inicio.getTime() - ahora.getTime() < VENTANA_GPS_MIN * MIN;

  const res = candidatos.map((c): Sugerencia => {
    const motivos: string[] = [];
    let apto = true;
    if (!c.vehiculo) { apto = false; motivos.push("Sin vehículo asignado"); }
    else {
      if (c.vehiculo.estado === "taller") { apto = false; motivos.push("Vehículo en taller"); }
      if (c.vehiculo.plazas < s.pasajeros) { apto = false; motivos.push(`Vehículo de ${c.vehiculo.plazas} plazas (necesita ${s.pasajeros})`); }
      if (c.vehiculo.maletas < s.maletas) { apto = false; motivos.push(`Vehículo con ${c.vehiculo.maletas} maletas (necesita ${s.maletas})`); }
    }
    const otros = c.agenda.filter((t) => t.servicioId !== s.id);
    if (otros.some((t) => t.inicio < fin && s.inicio < t.fin)) { apto = false; motivos.push("Ocupado a esa hora"); }

    let distancia: number | null = null;
    const gpsValido = c.posicion && ahora.getTime() - c.posicion.registradoEn.getTime() <= GPS_VALIDO_MIN * MIN;
    if (s.origen && inminente && gpsValido) {
      distancia = redondear(distanciaKm(c.posicion!.punto, s.origen));
      motivos.unshift(`A ${distancia} km (GPS)`);
    } else if (s.origen) {
      const anterior = otros.filter((t) => t.fin <= s.inicio && t.destino).sort((a, b) => b.fin.getTime() - a.fin.getTime())[0];
      if (anterior) {
        distancia = redondear(distanciaKm(anterior.destino!, s.origen));
        motivos.unshift(`A ${distancia} km desde su servicio anterior`);
      }
    }
    if (apto) motivos.push("Libre a esa hora");
    return { conductorId: c.conductorId, nombre: c.nombre, apto, motivos, distanciaKm: distancia };
  });

  return res.sort((a, b) =>
    a.apto !== b.apto ? (a.apto ? -1 : 1) : (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity));
}
