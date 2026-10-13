/**
 * «Vocabulario» de sonidos de la central (lógica pura): qué sonido corresponde a cada evento de un servicio,
 * cuál es más grave y un anti-ráfaga para no encadenar pitidos. La síntesis (Web Audio) está en src/lib/sonidos.ts.
 */
export type Sonido = "alarma" | "reserva_nueva" | "enviado" | "aceptado" | "rechazado" | "en_camino" | "cargado" | "completado" | "incidencia" | "llegando";

export interface InfoSonido { id: Sonido; nombre: string; significado: string; gravedad: number }

/** Catálogo, del más grave al más leve (gravedad: mayor = más importante; decide en una ráfaga). */
export const SONIDOS: readonly InfoSonido[] = [
  { id: "alarma", nombre: "Sirena (se repite cada 30 s, máx. 5, hasta pulsar «Visto»)", significado: "GRAVE: avería, accidente o golpe en el vehículo de un conductor, o una hoja de cierre con daños, testigo encendido u otra avería", gravedad: 10 },
  { id: "incidencia", nombre: "Tres pitidos", significado: "Aviso: retraso (o conductor que llega tarde a la recogida), cliente no presentado u otra incidencia, checklist con fallos, un servicio devuelto por el conductor, un paso deshecho o una hoja de cierre que pide mantenimiento (aceite, agua, neumáticos, luces, reserva)", gravedad: 9 },
  { id: "rechazado", nombre: "Dos tonos graves descendentes", significado: "Servicio rechazado o plazo de respuesta vencido", gravedad: 8 },
  { id: "reserva_nueva", nombre: "Dos tonos ascendentes", significado: "Reserva nueva desde la web", gravedad: 7 },
  { id: "aceptado", nombre: "Ding-ding alegre", significado: "El conductor ha aceptado el servicio", gravedad: 6 },
  { id: "llegando", nombre: "Campanita", significado: "El conductor está llegando a la recogida o al destino", gravedad: 5 },
  { id: "completado", nombre: "Arpegio de cierre", significado: "Servicio completado (pasajeros descargados) o hoja de cierre sin incidencias", gravedad: 4 },
  { id: "cargado", nombre: "Tono doble medio", significado: "Pasajeros a bordo (cargado)", gravedad: 3 },
  { id: "en_camino", nombre: "Tono suave", significado: "El conductor sale hacia la recogida", gravedad: 2 },
  { id: "enviado", nombre: "Whoosh", significado: "Servicio enviado (asignado o reasignado) a un conductor", gravedad: 1 },
];

const GRAVEDAD = Object.fromEntries(SONIDOS.map((s) => [s.id, s.gravedad])) as Record<Sonido, number>;
export const gravedad = (s: Sonido) => GRAVEDAD[s];
export const masGrave = (a: Sonido | null, b: Sonido): Sonido => (a && GRAVEDAD[a] >= GRAVEDAD[b] ? a : b);

const POR_TIPO: Record<string, Sonido> = {
  asignado: "enviado", reasignado: "enviado",
  aceptado: "aceptado",
  rechazado: "rechazado", expirado: "rechazado",
  en_camino: "en_camino",
  recogido: "cargado",
  completado: "completado",
  llegando_recogida: "llegando", llegando_destino: "llegando",
  retraso_recogida: "incidencia",
  deshecho: "incidencia",
  devuelto: "incidencia", // «No puedo hacer este servicio»: la central tiene que reasignarlo
};

/**
 * Sonido de un evento de `eventos_servicio`. «creado» solo suena si viene de la web (o si aún no se conoce el
 * servicio: las reservas manuales las crea la propia central y no hace falta avisarla). El resto (cancelado,
 * subcontratado, vuelos…) los provoca la central o son informativos: sin sonido.
 */
export function sonidoDeEvento(tipo: string, origenPedido?: "web" | "manual" | null): Sonido | null {
  if (tipo === "creado") return origenPedido === "manual" ? null : "reserva_nueva";
  return POR_TIPO[tipo] ?? null;
}

export interface EventoConId { id: number; creado_en: string }

/**
 * Eventos que aún no han sonado: no vistos y recientes (tras una reconexión llegan de golpe los de la caída; los
 * de hace más de `maxEdadMs` ya no se anuncian). Marca como vistos todos los recibidos.
 */
export function eventosNuevos<E extends EventoConId>(eventos: E[], vistos: Set<number>, ahora: number, maxEdadMs = 2 * 60_000): E[] {
  const out: E[] = [];
  for (const e of eventos) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    const t = Date.parse(e.creado_en);
    if (Number.isFinite(t) && ahora - t <= maxEdadMs) out.push(e);
  }
  return out;
}

export interface Reloj { ahora: () => number; programar: (f: () => void, ms: number) => unknown; cancelar: (t: unknown) => void }
const RELOJ: Reloj = { ahora: () => Date.now(), programar: (f, ms) => setTimeout(f, ms), cancelar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/**
 * Anti-ráfaga: como mucho un sonido cada `intervaloMs`. Lo que llega mientras tanto (o en la misma `ventanaMs`,
 * p. ej. varios eventos en el mismo mensaje de Realtime) se agrupa y suena solo el más grave.
 */
export function crearAntiRafaga(reproducir: (s: Sonido) => void, intervaloMs = 1500, ventanaMs = 120, reloj: Reloj = RELOJ) {
  let ultimo = -Infinity;
  let pendiente: Sonido | null = null;
  let t: unknown = null;
  const disparar = () => {
    t = null;
    const s = pendiente;
    pendiente = null;
    if (!s) return;
    ultimo = reloj.ahora();
    reproducir(s);
  };
  return {
    pedir(s: Sonido) {
      pendiente = masGrave(pendiente, s);
      if (t !== null) return;
      t = reloj.programar(disparar, Math.max(ventanaMs, ultimo + intervaloMs - reloj.ahora()));
    },
    cancelar() { if (t !== null) reloj.cancelar(t); t = null; pendiente = null; },
  };
}
