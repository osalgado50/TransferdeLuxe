/**
 * Empresa de demo funcionando como una de verdad (lógica pura): las reservas van llegando con antelación variable y más
 * de día que de noche (aeropuertos, hoteles, AVE, Barcelona), y los conductores fichan al empezar su turno, hacen una
 * pausa a media jornada y se desfichan al acabar con la hoja de cierre. El servidor (empresaViva) lo aplica.
 * Todo sale de una semilla por franja de 30 min: dos pasadas (o dos servidores) generan exactamente lo mismo.
 */
import { duracionServicio } from "@/lib/dominio/duracion";
import { LUGARES_DEMO } from "./datosDemo";

const MIN = 60_000;
export const FRANJA_MS = 30 * MIN;
const L = LUGARES_DEMO;
type ClaveLugar = keyof typeof L;

/** Generador pseudoaleatorio determinista (mulberry32) a partir de un número. */
export function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Mezcla de bits (murmur3 fmix32): franjas seguidas dan semillas muy distintas (si no, salían trayectos repetidos). */
function mezclar(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
const elegir = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];
function ponderado<T>(r: () => number, xs: readonly (readonly [T, number])[]): T {
  const total = xs.reduce((s, [, p]) => s + p, 0);
  let x = r() * total;
  for (const [v, p] of xs) { if ((x -= p) < 0) return v; }
  return xs[xs.length - 1][0];
}

const horaMadrid = (ms: number) => Number(new Intl.DateTimeFormat("es-ES", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(new Date(ms)));
/**
 * Probabilidad de que entre una reserva para una franja de 30 min, según la hora: ≈ 8 servicios al día, lo que puede
 * llevar una empresa pequeña con un conductor por turno (los picos se subcontratan, como en la realidad).
 */
export function demandaFranja(ms: number): number {
  const h = horaMadrid(ms);
  if (h < 6) return 0.05;
  if (h < 9) return 0.22;
  if (h < 20) return 0.24;
  if (h < 23) return 0.18;
  return 0.08;
}

const HOTELES: ClaveLugar[] = ["salou", "cambrils", "pineda", "pa", "miami", "tgn"];
/** Trayecto típico de una empresa de traslados de la Costa Dorada (llegadas y salidas de Reus, Barcelona, AVE, local). */
function trayecto(r: () => number): [ClaveLugar, ClaveLugar] {
  const tipo = ponderado(r, [["llegada_reus", 30], ["salida_reus", 25], ["bcn", 15], ["ave", 20], ["local", 10]] as const);
  const hotel = elegir(r, HOTELES);
  if (tipo === "llegada_reus") return ["reus", hotel];
  if (tipo === "salida_reus") return [hotel, "reus"];
  if (tipo === "bcn") return r() < 0.5 ? ["bcn", hotel] : [hotel, "bcn"];
  if (tipo === "ave") return r() < 0.5 ? ["ave", hotel] : [hotel, "ave"];
  const a = elegir(r, HOTELES);
  const b = elegir(r, HOTELES.filter((x) => x !== a));
  return [a, b];
}

const NOMBRES = ["Lucía", "Hugo", "Emma", "Daniel", "Paula", "Marta", "Pablo", "Irene", "Álex", "Clara", "Jorge", "Sara", "Nil", "Laura",
  "Martina", "Pol", "Júlia", "Oriol", "Anna", "Marc", "Noa", "Biel", "Carla", "Arnau", "Sofia", "Eric", "Ingrid", "Lars", "Chloé", "Tom"];
const APELLIDOS = ["Ferrer Vidal", "Martín Soler", "Roca Puig", "Serra Costa", "Gil Navarro", "Pons Ribas", "Vila Mas", "Castells Font",
  "Prats Camps", "Mir Sala", "Bosch Pujol", "Llorens Vives", "Esteve Valls", "Ortega Rius", "Andersen", "Dubois", "Müller", "Smith"];
const VUELOS = ["FR", "VY", "LS", "U2", "W6", "TOM", "EZY", "BY"];

export interface ReservaDemo {
  /** Identifica la reserva de forma única (franja): se guarda en el correo del cliente para no duplicarla. */
  clave: string;
  recogida: number; creadaEn: number;
  origen: ClaveLugar; destino: ClaveLugar;
  cliente_nombre: string; cliente_apellidos: string; cliente_email: string; cliente_telefono: string;
  pasajeros: number; maletas: number; tipo_vehiculo_pedido: "sedan" | "minivan" | "minivan_premium";
  numero_vuelo: string | null; origen_pedido: "web" | "manual"; duracion_estimada_min: number;
}

/** «20261023-1430» (hora de Madrid) de un instante. */
export function claveFranja(ms: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}
export const correoReserva = (clave: string) => `reserva.${clave}@ejemplo.test`;
export const esCorreoReserva = (email: string | null | undefined) => /^reserva\.\d{8}-\d{4}@ejemplo\.test$/.test(email ?? "");

/** Reserva de una franja (o null si en esa franja no entra ninguna). Siempre la misma para la misma franja. */
export function reservaDeFranja(inicioFranja: number): ReservaDemo | null {
  const r = aleatorio(mezclar(Math.floor(inicioFranja / FRANJA_MS)));
  r(); // la primera salida de mulberry32 se parece mucho entre semillas cercanas
  if (r() >= demandaFranja(inicioFranja)) return null;
  const recogida = inicioFranja + Math.floor(r() * 6) * 5 * MIN; // :00, :05… dentro de la franja
  const [origen, destino] = trayecto(r);
  // Antelación: el 20 % el mismo día (1,5–6 h), la mitad la víspera (6–30 h) y el resto con 1–3 días.
  const ant = ponderado(r, [[[1.5, 6], 20], [[6, 30], 50], [[30, 72], 30]] as const);
  const creadaEn = recogida - Math.round((ant[0] + r() * (ant[1] - ant[0])) * 60) * MIN;
  const pasajeros = ponderado(r, [[1, 15], [2, 40], [3, 15], [4, 18], [5, 6], [6, 6]] as const);
  const maletas = Math.max(0, pasajeros + ponderado(r, [[-1, 30], [0, 50], [1, 20]] as const));
  const tipo = pasajeros <= 3 && maletas <= 3 ? (r() < 0.1 ? "minivan_premium" : "sedan") : (r() < 0.1 ? "minivan_premium" : "minivan");
  const aeropuerto = origen === "reus" || origen === "bcn";
  const clave = claveFranja(inicioFranja);
  const o = L[origen], d = L[destino];
  const dur = duracionServicio({ origen: o, destino: d, origenTexto: o.t, destinoTexto: d.t }).totalMin;
  return {
    clave, recogida, creadaEn, origen, destino,
    cliente_nombre: elegir(r, NOMBRES), cliente_apellidos: elegir(r, APELLIDOS), cliente_email: correoReserva(clave),
    cliente_telefono: `600 000 ${String(100 + Math.floor(r() * 900))}`, pasajeros, maletas, tipo_vehiculo_pedido: tipo,
    numero_vuelo: aeropuerto ? `${elegir(r, VUELOS)}${1000 + Math.floor(r() * 8999)}` : null,
    origen_pedido: r() < 0.6 ? "web" : "manual", duracion_estimada_min: dur,
  };
}

/** Reservas con recogida entre `desde` y `hasta` que ya se han hecho a la hora `ahora` (creadaEn ≤ ahora). */
export function reservasEntre(desde: number, hasta: number, ahora: number): ReservaDemo[] {
  const out: ReservaDemo[] = [];
  for (let f = Math.floor(desde / FRANJA_MS) * FRANJA_MS; f < hasta; f += FRANJA_MS) {
    const x = reservaDeFranja(f);
    if (x && x.recogida >= desde && x.recogida < hasta && x.creadaEn <= ahora) out.push(x);
  }
  return out;
}

// ── Jornada de los conductores de demo ──

export interface TurnoDemo { inicio: number; fin: number }
export interface EstadoConductorDemo {
  turno: TurnoDemo | null;
  /** Jornada abierta: desde cuándo, si está en pausa y cuántas pausas lleva. */
  abierta: { inicio: number; enPausaDesde: number | null; pausas: number } | null;
  /** Lleva un servicio en marcha (de camino o con pasajeros). */
  ocupado: boolean;
  /** Recogida más próxima de sus servicios aceptados o asignados (ms) o null. */
  proximaRecogida: number | null;
  /** Ya cerró una jornada en este turno (no vuelve a fichar). */
  cerroEsteTurno: boolean;
}
export type DecisionJornada = "fichar" | "pausa" | "reanudar" | "desfichar" | null;

/** Unos minutos de variación, fijos para cada conductor y turno (unos llegan antes, otros justo). */
export const variacion = (conductorId: string, turnoInicio: number, rango: number) => {
  let h = 0;
  for (const ch of `${conductorId}|${turnoInicio}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return (h % (rango + 1)) * MIN;
};

/** Qué haría ahora un conductor de verdad con su jornada. */
export function decisionJornada(id: string, e: EstadoConductorDemo, ahora: number): DecisionJornada {
  const t = e.turno;
  if (!e.abierta) {
    if (!t || e.cerroEsteTurno) return null;
    // Ficha entre 8 min antes y la hora de entrada, y no a última hora del turno.
    return ahora >= t.inicio - 8 * MIN + variacion(id, t.inicio, 8) && ahora < t.fin - 30 * MIN ? "fichar" : null;
  }
  const libre = !e.ocupado && (e.proximaRecogida == null || e.proximaRecogida - ahora > 50 * MIN);
  if (e.abierta.enPausaDesde != null) {
    // Pausa de 20–30 min; antes si se le echa encima un servicio.
    const dura = 20 * MIN + variacion(id, e.abierta.inicio, 10);
    return ahora - e.abierta.enPausaDesde >= dura || !libre ? "reanudar" : null;
  }
  // Fin: pasada su hora (con unos minutos) y sin nada en marcha ni a punto de empezar. Sin turno (lo fichó otro): igual.
  const fin = t ? t.fin + variacion(id, t.fin, 10) : e.abierta.inicio + 8 * 60 * MIN;
  if (ahora >= fin && !e.ocupado && (e.proximaRecogida == null || e.proximaRecogida - ahora > 25 * MIN)) return "desfichar";
  // Una pausa a media jornada (turnos de 6 h o más), cuando está libre.
  if (t && e.abierta.pausas === 0 && t.fin - t.inicio >= 6 * 60 * MIN && libre) {
    const mitad = t.inicio + (t.fin - t.inicio) * 0.45;
    if (ahora >= mitad && ahora < t.fin - 90 * MIN) return "pausa";
  }
  return null;
}

// ── Reserva sin hueco: otras horas cercanas ──

/** Desplazamientos (min) a probar, del más cercano al más lejano, empezando por más tarde. */
export const DESPLAZAMIENTOS_ALTERNATIVA = [30, 60, -30, 90, 120, -60, 150, 180] as const;
