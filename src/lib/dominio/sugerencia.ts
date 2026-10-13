import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";
import { encaja, deTramo, type EstadoTransicion } from "./planificacion";
import { bloqueoConductor, type Ausencia } from "./ausencias";
import { cabeServicio, type HorarioConductor } from "./horarios";

export interface ServicioParaSugerir { id: string; inicio: Date; duracionMin: number; pasajeros: number; maletas: number; origen: Punto | null;
  destino?: Punto | null; origenTexto?: string; destinoTexto?: string }
export interface TramoAgenda { servicioId: string; inicio: Date; fin: Date; destino: Punto | null;
  origen?: Punto | null; origenTexto?: string; destinoTexto?: string }
export interface Candidato {
  conductorId: string; nombre: string;
  vehiculo: { id: string; plazas: number; maletas: number; estado: "activo" | "taller" } | null;
  posicion: { punto: Punto; registradoEn: Date } | null;
  agenda: TramoAgenda[];
  /** Ausencias (vacaciones, fiesta…) del conductor: si cubren el día/franja del servicio, no es apto. */
  ausencias?: Ausencia[];
  /** Día (Madrid) en que ya ha cerrado su jornada: no apto para servicios de ese día. */
  jornadaCerradaDia?: string | null;
  /** Horario (semana tipo + excepciones): fuera de turno, en la pausa o sin tiempo de volver a la base → no apto. */
  horario?: HorarioConductor | null;
}
export interface Sugerencia { conductorId: string; nombre: string; apto: boolean; motivos: string[]; distanciaKm: number | null;
  /** Peor margen (min) de llegada entre el servicio anterior y el siguiente; null si no hay datos. */
  margenMin?: number | null; viabilidad?: EstadoTransicion;
  /** Ausencia que cubre el servicio (asignar a mano pide confirmación). */
  ausencia?: Pick<Ausencia, "tipo" | "franja"> | null;
  /** «Fuera de horario (pausa 13:00–16:00)», «No vuelve a la base antes de las 15:00»… (asignar a mano pide confirmación). */
  fueraHorario?: string | null }

const MIN = 60_000;
const VENTANA_GPS_MIN = 60;
const GPS_VALIDO_MIN = 5;
const redondear = (km: number) => Math.round(km * 10) / 10;

/** `base`: base/depósito (ajustes.base_*): el primer servicio del tramo sale de ella y el último vuelve a ella. */
export function sugerirConductores(s: ServicioParaSugerir, candidatos: Candidato[], ahora: Date, o: { base?: Punto | null } = {}): Sugerencia[] {
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
    const bloqueo = bloqueoConductor({ id: c.conductorId, ausencias: c.ausencias, jornadaCerradaDia: c.jornadaCerradaDia }, s.inicio);
    if (bloqueo) { apto = false; motivos.push(bloqueo.motivo); }
    const otros = c.agenda.filter((t) => t.servicioId !== s.id);
    const hz = cabeServicio(c.horario, { id: s.id, inicio: s.inicio, duracionMin: s.duracionMin, origen: s.origen, destino: s.destino ?? null },
      { base: o.base, agenda: otros.map((t) => ({ id: t.servicioId, inicio: t.inicio.getTime(), fin: t.fin.getTime() })) });
    if (!hz.cabe) { apto = false; motivos.push(hz.motivo!); }
    else if (hz.tramo) motivos.push(`En turno (${hz.tramo.inicio}–${hz.tramo.fin})`);
    let margenMin: number | null = null;
    let viabilidad: EstadoTransicion = "desconocido";
    if (otros.some((t) => t.inicio < fin && s.inicio < t.fin)) { apto = false; motivos.push("Ocupado a esa hora"); }
    else {
      const plan = otros.map(deTramo);
      const e = encaja({ id: s.id, inicio: s.inicio, duracionMin: s.duracionMin, origen: s.origen, destino: s.destino ?? null,
        origenTexto: s.origenTexto, destinoTexto: s.destinoTexto }, plan);
      const margenes = [e.anterior, e.siguiente].map((t) => t?.margenMin).filter((m): m is number => m != null);
      margenMin = margenes.length ? Math.min(...margenes) : null;
      viabilidad = e.peor?.estado ?? "ok";
      const desde = e.anterior?.desdeTexto ? ` desde ${e.anterior.desdeTexto}` : " desde su servicio anterior";
      const hacia = e.siguiente?.hastaTexto ? ` a ${e.siguiente.hastaTexto}` : "";
      if (e.anterior?.estado === "no_llega") { apto = false; motivos.push(`No llega a tiempo${desde}`); }
      else if (e.anterior?.margenMin != null) motivos.push(`Llega con ${e.anterior.margenMin} min de margen${desde}`);
      if (e.siguiente?.estado === "no_llega") { apto = false; motivos.push(`No llega a tiempo al siguiente servicio${hacia}`); }
      else if (e.siguiente?.estado === "justo") motivos.push(`Justo para el siguiente servicio${hacia} (${e.siguiente.margenMin} min de margen)`);
    }

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
    return { conductorId: c.conductorId, nombre: c.nombre, apto, motivos, distanciaKm: distancia, margenMin, viabilidad,
      ausencia: bloqueo?.ausencia ? { tipo: bloqueo.ausencia.tipo, franja: bloqueo.ausencia.franja } : null,
      fueraHorario: hz.cabe ? null : hz.motivo };
  });

  const RANGO: Partial<Record<EstadoTransicion, number>> = { desconocido: 1, justo: 2 };
  const rango = (x: Sugerencia) => RANGO[x.viabilidad ?? "ok"] ?? 0;
  return res.sort((a, b) =>
    a.apto !== b.apto ? (a.apto ? -1 : 1)
      : rango(a) !== rango(b) ? rango(a) - rango(b)
      : (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity) || (b.margenMin ?? -Infinity) - (a.margenMin ?? -Infinity));
}
