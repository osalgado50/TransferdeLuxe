import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";
import type { Candidato, TramoAgenda } from "./sugerencia";
import { duracionEfectiva } from "./duracion";

/** Estados que ocupan la agenda de un conductor (los terminales no cuentan para encajar ni para traslados). */
export const ESTADOS_AGENDA = ["asignado", "aceptado", "en_camino", "recogido"] as const;
export const enAgenda = (estado: string) => (ESTADOS_AGENDA as readonly string[]).includes(estado);

/** Fila de servicio tal como viene de la BD (subconjunto). */
export interface FilaPlan {
  id: string; fecha_hora_recogida: string; duracion_estimada_min: number;
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
  origen_texto?: string | null; destino_texto?: string | null;
}

/** Mismo modelo que duracionEstimadaMin (recta × 1,3 a 70 km/h) pero sin el margen de carga. */
const FACTOR_CARRETERA = 1.3, VELOCIDAD_MEDIA_KMH = 70;
const MIN = 60_000;
export const MARGEN_JUSTO_MIN = 15;

export type EstadoTransicion = "ok" | "justo" | "no_llega" | "desconocido";

export interface ServicioPlan {
  id: string; inicio: Date; duracionMin: number;
  origen: Punto | null; destino: Punto | null;
  origenTexto?: string; destinoTexto?: string;
}

export interface Transicion {
  anteriorId: string; siguienteId: string; inicioSiguiente: Date;
  finAnterior: Date; trasladoMin: number | null; llegadaEstimada: Date | null;
  margenMin: number | null; estado: EstadoTransicion;
  desdeTexto?: string; hastaTexto?: string;
}

/** Duración con la que se planifica una fila: la guardada o la calculada (trayecto + carga/descarga), la mayor. */
export function duracionFila(f: FilaPlan): number {
  const origen = f.origen_lat != null && f.origen_lng != null ? { lat: f.origen_lat, lng: f.origen_lng } : null;
  const destino = f.destino_lat != null && f.destino_lng != null ? { lat: f.destino_lat, lng: f.destino_lng } : null;
  return duracionEfectiva({ origen, destino, origenTexto: f.origen_texto, destinoTexto: f.destino_texto, guardadaMin: f.duracion_estimada_min });
}

export function aPlan(f: FilaPlan): ServicioPlan {
  return {
    id: f.id, inicio: new Date(f.fecha_hora_recogida), duracionMin: duracionFila(f),
    origen: f.origen_lat != null && f.origen_lng != null ? { lat: f.origen_lat, lng: f.origen_lng } : null,
    destino: f.destino_lat != null && f.destino_lng != null ? { lat: f.destino_lat, lng: f.destino_lng } : null,
    origenTexto: f.origen_texto ?? undefined, destinoTexto: f.destino_texto ?? undefined,
  };
}

export const aTramo = (p: ServicioPlan): TramoAgenda => ({ servicioId: p.id, inicio: p.inicio, fin: finDe(p),
  origen: p.origen, destino: p.destino, origenTexto: p.origenTexto, destinoTexto: p.destinoTexto });
export const deTramo = (t: TramoAgenda): ServicioPlan => ({ id: t.servicioId, inicio: t.inicio,
  duracionMin: (t.fin.getTime() - t.inicio.getTime()) / MIN, origen: t.origen ?? null, destino: t.destino,
  origenTexto: t.origenTexto, destinoTexto: t.destinoTexto });

/** Construye los candidatos (vehículo habitual + agenda en estados activos) a partir de filas de BD. */
export function construirCandidatos(
  conductores: { id: string; nombre: string; vehiculo_habitual_id: string | null }[],
  vehiculos: { id: string; plazas: number; maletas: number; estado: "activo" | "taller" }[],
  agenda: (FilaPlan & { conductor_id: string | null; estado: string })[],
  posiciones: Record<string, Candidato["posicion"]> = {},
): Candidato[] {
  return conductores.map((c) => {
    const v = vehiculos.find((x) => x.id === c.vehiculo_habitual_id);
    return {
      conductorId: c.id, nombre: c.nombre, posicion: posiciones[c.id] ?? null,
      vehiculo: v ? { id: v.id, plazas: v.plazas, maletas: v.maletas, estado: v.estado } : null,
      agenda: agenda.filter((a) => a.conductor_id === c.id && enAgenda(a.estado)).map((a) => aTramo(aPlan(a))),
    };
  });
}

/** Minutos de conducción en vacío entre dos puntos; 0 si es el mismo; null si falta alguno. */
export function tiempoTraslado(desde: Punto | null, hasta: Punto | null): number | null {
  if (!desde || !hasta) return null;
  const km = distanciaKm(desde, hasta);
  if (km < 0.05) return 0;
  return Math.ceil(((km * FACTOR_CARRETERA) / VELOCIDAD_MEDIA_KMH) * 60);
}

export const finDe = (s: { inicio: Date; duracionMin: number }) => new Date(s.inicio.getTime() + s.duracionMin * MIN);

/** `justo`: por debajo o igual a este margen (min) es «justo» (por defecto 15; la central usa ajustes.margen_minimo_min). */
export function estadoMargen(margen: number | null, justo = MARGEN_JUSTO_MIN): EstadoTransicion {
  if (margen == null) return "desconocido";
  if (margen < 0) return "no_llega";
  return margen <= justo ? "justo" : "ok";
}

export function transicion(a: ServicioPlan, b: ServicioPlan, justo = MARGEN_JUSTO_MIN): Transicion {
  const finAnterior = finDe(a);
  const trasladoMin = tiempoTraslado(a.destino, b.origen);
  const llegadaEstimada = trasladoMin == null ? null : new Date(finAnterior.getTime() + trasladoMin * MIN);
  const margenMin = llegadaEstimada ? Math.floor((b.inicio.getTime() - llegadaEstimada.getTime()) / MIN) : null;
  return {
    anteriorId: a.id, siguienteId: b.id, inicioSiguiente: b.inicio, finAnterior, trasladoMin, llegadaEstimada, margenMin,
    estado: estadoMargen(margenMin, justo), desdeTexto: a.destinoTexto, hastaTexto: b.origenTexto,
  };
}

const ordenar = <T extends { inicio: Date }>(xs: T[]) => [...xs].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

/** Plan del día de un conductor: fin de cada servicio y transiciones entre consecutivos. */
export function planDia(servicios: ServicioPlan[], justo = MARGEN_JUSTO_MIN): { fines: Record<string, Date>; transiciones: Transicion[] } {
  const orden = ordenar(servicios);
  const fines: Record<string, Date> = {};
  for (const s of orden) fines[s.id] = finDe(s);
  const transiciones = orden.slice(1).map((b, i) => transicion(orden[i], b, justo));
  return { fines, transiciones };
}

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
export const fmtHora = (d: Date) => hora.format(d);
export function fmtDuracion(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Texto explicativo de una transición problemática o «justa». */
export function razonTransicion(t: Transicion): string {
  const lugar = t.desdeTexto ? ` en ${t.desdeTexto}` : "";
  const termina = `termina ${fmtHora(t.finAnterior)}${lugar}`;
  if (t.estado === "desconocido") return `Sin coordenadas: ${termina}, no se puede estimar el traslado`;
  const base = `${termina}, necesita ${fmtDuracion(t.trasladoMin!)} → llegaría ${fmtHora(t.llegadaEstimada!)}`;
  if (t.estado === "no_llega") return `No llega: ${base} y la recogida es a las ${fmtHora(t.inicioSiguiente)}`;
  return `${t.estado === "justo" ? "Justo" : "Llega"}: ${base}, ${t.margenMin} min de margen`;
}

const GRAVEDAD: Record<EstadoTransicion, number> = { no_llega: 3, justo: 2, desconocido: 1, ok: 0 };

export interface ResultadoEncaje {
  encaja: boolean; solapa: boolean;
  peor: Transicion | null; anterior: Transicion | null; siguiente: Transicion | null; razon: string | null;
}

/** ¿Cabe el servicio en la agenda del conductor sin romper la transición anterior ni la siguiente? */
export function encaja(s: ServicioPlan, agenda: ServicioPlan[], justo = MARGEN_JUSTO_MIN): ResultadoEncaje {
  const otros = ordenar(agenda.filter((a) => a.id !== s.id));
  const fin = finDe(s);
  const solapes = otros.filter((a) => a.inicio < fin && s.inicio < finDe(a));
  const libres = otros.filter((a) => !solapes.includes(a));
  const previo = libres.filter((a) => a.inicio <= s.inicio).pop() ?? null;
  const proximo = libres.find((a) => a.inicio > s.inicio) ?? null;
  const anterior = previo ? transicion(previo, s, justo) : null;
  const siguiente = proximo ? transicion(s, proximo, justo) : null;
  const ts = [anterior, siguiente].filter((t): t is Transicion => !!t);
  const peor = ts.reduce<Transicion | null>((p, t) => (!p || GRAVEDAD[t.estado] > GRAVEDAD[p.estado] ? t : p), null);
  if (solapes.length) {
    const lista = solapes.map((a) => `${fmtHora(a.inicio)}–${fmtHora(finDe(a))}`).join(", ");
    return { encaja: false, solapa: true, peor, anterior, siguiente,
      razon: `Ocupado: se solapa con ${solapes.length === 1 ? "el servicio" : "los servicios"} de ${lista}` };
  }
  const ok = !ts.some((t) => t.estado === "no_llega");
  return { encaja: ok, solapa: false, peor, anterior, siguiente, razon: peor && peor.estado !== "ok" ? razonTransicion(peor) : null };
}
