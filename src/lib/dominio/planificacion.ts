import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";

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

/** Minutos de conducción en vacío entre dos puntos; 0 si es el mismo; null si falta alguno. */
export function tiempoTraslado(desde: Punto | null, hasta: Punto | null): number | null {
  if (!desde || !hasta) return null;
  const km = distanciaKm(desde, hasta);
  if (km < 0.05) return 0;
  return Math.ceil(((km * FACTOR_CARRETERA) / VELOCIDAD_MEDIA_KMH) * 60);
}

export const finDe = (s: { inicio: Date; duracionMin: number }) => new Date(s.inicio.getTime() + s.duracionMin * MIN);

export function estadoMargen(margen: number | null): EstadoTransicion {
  if (margen == null) return "desconocido";
  if (margen < 0) return "no_llega";
  return margen <= MARGEN_JUSTO_MIN ? "justo" : "ok";
}

export function transicion(a: ServicioPlan, b: ServicioPlan): Transicion {
  const finAnterior = finDe(a);
  const trasladoMin = tiempoTraslado(a.destino, b.origen);
  const llegadaEstimada = trasladoMin == null ? null : new Date(finAnterior.getTime() + trasladoMin * MIN);
  const margenMin = llegadaEstimada ? Math.floor((b.inicio.getTime() - llegadaEstimada.getTime()) / MIN) : null;
  return {
    anteriorId: a.id, siguienteId: b.id, inicioSiguiente: b.inicio, finAnterior, trasladoMin, llegadaEstimada, margenMin,
    estado: estadoMargen(margenMin), desdeTexto: a.destinoTexto, hastaTexto: b.origenTexto,
  };
}

const ordenar = <T extends { inicio: Date }>(xs: T[]) => [...xs].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

/** Plan del día de un conductor: fin de cada servicio y transiciones entre consecutivos. */
export function planDia(servicios: ServicioPlan[]): { fines: Record<string, Date>; transiciones: Transicion[] } {
  const orden = ordenar(servicios);
  const fines: Record<string, Date> = {};
  for (const s of orden) fines[s.id] = finDe(s);
  const transiciones = orden.slice(1).map((b, i) => transicion(orden[i], b));
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
export function encaja(s: ServicioPlan, agenda: ServicioPlan[]): ResultadoEncaje {
  const otros = ordenar(agenda.filter((a) => a.id !== s.id));
  const fin = finDe(s);
  const solape = otros.find((a) => a.inicio < fin && s.inicio < finDe(a));
  const previo = otros.filter((a) => a.inicio <= s.inicio && a !== solape).pop() ?? null;
  const proximo = otros.find((a) => a.inicio > s.inicio && a !== solape) ?? null;
  const anterior = previo ? transicion(previo, s) : null;
  const siguiente = proximo ? transicion(s, proximo) : null;
  const ts = [anterior, siguiente].filter((t): t is Transicion => !!t);
  const peor = ts.reduce<Transicion | null>((p, t) => (!p || GRAVEDAD[t.estado] > GRAVEDAD[p.estado] ? t : p), null);
  if (solape) {
    return { encaja: false, solapa: true, peor, anterior, siguiente,
      razon: `Ocupado: se solapa con el servicio de ${fmtHora(solape.inicio)} a ${fmtHora(finDe(solape))}` };
  }
  const ok = !ts.some((t) => t.estado === "no_llega");
  return { encaja: ok, solapa: false, peor, anterior, siguiente, razon: peor && peor.estado !== "ok" ? razonTransicion(peor) : null };
}
