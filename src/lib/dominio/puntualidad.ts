/**
 * Puntualidad del conductor camino de la recogida (lógica pura, compartida por la app nativa y la PWA):
 * contador verde / ámbar / rojo y cuándo avisar a la central de que llega tarde.
 */
export type EstadoPuntualidad = "a_tiempo" | "justo" | "tarde";

export interface Puntualidad {
  /** null si el servicio no está camino de la recogida (pendiente, recogido, completado…). */
  estado: EstadoPuntualidad | null;
  /** Minutos que faltan para la hora de recogida (negativo si ya pasó). */
  minutosHastaRecogida: number;
  /** Minutos de retraso previstos (o ya acumulados); 0 si llega a tiempo. */
  minutosRetraso: number;
  texto: string;
  /** «Tarde» por la ETA de la ruta, aún antes de la hora: es cuando se avisa a la central por adelantado. */
  porEta: boolean;
  /** Llegada estimada (ms) si hay ETA. */
  llegadaEstimada: number | null;
}

/** Estados en los que el conductor aún tiene que llegar a la recogida. */
export const ESTADOS_PUNTUALIDAD = ["asignado", "aceptado", "en_camino"] as const;
/** Tolerancia: llegar hasta 2 min después de la hora aún no cuenta como tarde (por ETA). */
export const MARGEN_TARDE_MIN = 2;
/** Por debajo de 5 min de margen, «justo» (ámbar). */
export const MARGEN_JUSTO_MIN = 5;
export const REFRESCO_PUNTUALIDAD_MS = 15_000;
/** Aviso automático fallido: como mucho un intento cada 60 s. */
export const REINTENTO_AVISO_RETRASO_MS = 60_000;

const MIN = 60_000;
const ms = (t: string | number | Date) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t));

/** «12 min», «2 h 05 min». */
export function formatoMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export function calcularPuntualidad(e: {
  estado: string; recogida: string | number | Date; ahora: number | Date; etaS?: number | null;
}): Puntualidad {
  const recogida = ms(e.recogida), ahora = ms(e.ahora);
  const hasta = recogida - ahora;
  const minutosHastaRecogida = hasta >= 0 ? Math.ceil(hasta / MIN) : -Math.max(1, Math.floor(-hasta / MIN));
  const eta = e.etaS != null && Number.isFinite(e.etaS) && e.etaS >= 0 ? e.etaS : null;
  const llegadaEstimada = eta != null ? ahora + eta * 1000 : null;
  const vacio: Puntualidad = { estado: null, minutosHastaRecogida, minutosRetraso: 0, texto: "", porEta: false, llegadaEstimada };
  if (!(ESTADOS_PUNTUALIDAD as readonly string[]).includes(e.estado) || !Number.isFinite(recogida) || !Number.isFinite(ahora)) return vacio;

  if (ahora > recogida) {
    const hace = -minutosHastaRecogida;
    const minutosRetraso = llegadaEstimada != null ? Math.max(hace, Math.round((llegadaEstimada - recogida) / MIN)) : hace;
    return { ...vacio, estado: "tarde", minutosRetraso, texto: `Recogida hace ${formatoMinutos(hace)} · aún no has llegado` };
  }
  if (llegadaEstimada != null) {
    if (llegadaEstimada > recogida + MARGEN_TARDE_MIN * MIN) {
      const minutosRetraso = Math.round((llegadaEstimada - recogida) / MIN);
      return { ...vacio, estado: "tarde", minutosRetraso, porEta: true, texto: `Llegas tarde · +${formatoMinutos(minutosRetraso)}` };
    }
    const margen = (recogida - llegadaEstimada) / MIN;
    if (margen < MARGEN_JUSTO_MIN) {
      const m = Math.max(0, Math.floor(margen));
      return { ...vacio, estado: "justo", texto: m > 0 ? `Llegas justo · ${m} min de margen` : "Llegas justo · sin margen" };
    }
    return { ...vacio, estado: "a_tiempo", texto: `Faltan ${formatoMinutos(minutosHastaRecogida)} · llegas a tiempo` };
  }
  // Sin ruta (aún no ha salido o sin GPS): solo el reloj.
  return { ...vacio, estado: hasta < MARGEN_JUSTO_MIN * MIN ? "justo" : "a_tiempo", texto: `Faltan ${formatoMinutos(minutosHastaRecogida)} para la recogida` };
}

/** Colores del contador (fondo / texto), iguales en la app y en la web. */
export const COLOR_PUNTUALIDAD: Record<EstadoPuntualidad, { fondo: string; texto: string }> = {
  a_tiempo: { fondo: "#16a34a", texto: "#ffffff" },
  justo: { fondo: "#f59e0b", texto: "#0f172a" },
  tarde: { fondo: "#dc2626", texto: "#ffffff" },
};

/** Clave «una sola vez» del aviso automático de retraso por servicio (AsyncStorage / localStorage). */
export const claveAvisoRetraso = (servicioId: string) => `tdl-retraso:${servicioId}`;

/**
 * ¿Hay que enviar ahora el aviso anticipado a la central? Solo si va tarde POR LA ETA (antes de la hora), no se ha
 * enviado ya con éxito, no hay otro envío en curso y han pasado ≥ 60 s desde el último intento.
 */
export function debeAvisarRetraso(p: Puntualidad, o: { enviado: boolean; enCurso: boolean; ultimoIntento: number; ahora: number }): boolean {
  return p.estado === "tarde" && p.porEta && !o.enviado && !o.enCurso && o.ahora - o.ultimoIntento >= REINTENTO_AVISO_RETRASO_MS;
}

const fmtHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
/** «Aviso automático: llegada estimada 19:58 (+8 min)» */
export function textoAvisoRetraso(p: Pick<Puntualidad, "llegadaEstimada" | "minutosRetraso">): string {
  const h = p.llegadaEstimada != null ? fmtHora.format(new Date(p.llegadaEstimada)) : "—";
  return `Aviso automático: llegada estimada ${h} (+${p.minutosRetraso} min)`;
}
