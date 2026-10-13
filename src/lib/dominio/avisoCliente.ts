/**
 * Aviso al cliente por WhatsApp «un toque» (sin API, gratis) o SMS: lógica pura compartida por la app nativa, la PWA
 * y la central. Se abre el chat del cliente con el texto ya escrito y el humano pulsa «enviar».
 */
import { calcularPuntualidad } from "./puntualidad";

export type TipoAviso = "en_camino" | "retraso" | "llegado" | "reasignacion";
export type CanalAviso = "whatsapp" | "sms";
export type IdiomaAviso = "es" | "en";
export const TIPOS_AVISO: readonly TipoAviso[] = ["en_camino", "retraso", "llegado", "reasignacion"];

/** Para la Actividad en vivo: «💬 Marc ha avisado al cliente: en camino». */
export const NOMBRE_AVISO: Record<TipoAviso, string> = {
  en_camino: "en camino", retraso: "llega con retraso", llegado: "ya está en la recogida", reasignacion: "cambio de conductor",
};
/** Botones de la hoja «Avisar al cliente». */
export const BOTON_AVISO: Record<TipoAviso, string> = {
  en_camino: "🚗 Voy de camino", retraso: "⏱️ Me retraso", llegado: "📍 Ya estoy aquí", reasignacion: "🔁 Cambio de conductor",
};

/**
 * Teléfono a E.164 sin «+» (lo que piden wa.me y sms:). España por defecto: 9 cifras que empiezan por 6, 7, 8 o 9 →
 * +34. Acepta «+», «00», espacios, guiones, puntos y paréntesis. null si no parece un número válido.
 */
export function normalizarTelefono(t: string | null | undefined, prefijoPais = "34"): string | null {
  if (!t) return null;
  let s = t.trim().replace(/[\s().\-/]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (/^[6789]\d{8}$/.test(s)) s = prefijoPais + s;
  else if (prefijoPais === "34" && /^34[6789]\d{8}$/.test(s)) { /* ya lleva el 34 sin «+» */ }
  else if (!/^\d+$/.test(s) || s.length < 10) return null;
  if (!/^\d{8,15}$/.test(s) || s.startsWith("0")) return null;
  return s;
}

/** «Marc García» → «Marc» (el cliente ve solo el nombre de pila). */
export const nombreDePila = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";

const fmtHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
/** Hora de Madrid «19:58» de un instante (ms o fecha). */
export const horaAviso = (t: number | string | Date) => fmtHora.format(new Date(t));

export interface DatosAviso {
  /** Nombre del cliente (se usa el de pila). */
  cliente?: string | null;
  /** Nombre del conductor (se usa el de pila); en la central, el del conductor asignado. */
  conductor?: string | null;
  /** Llegada estimada «19:58». */
  hora?: string | null;
  /** Minutos de retraso previstos. */
  minutos?: number | null;
  /** Enlace a la página pública de seguimiento. */
  enlace?: string | null;
  modelo?: string | null;
  matricula?: string | null;
  idioma?: IdiomaAviso;
  /** Quién escribe: el conductor (1.ª persona, por defecto) o la central (3.ª persona). */
  emisor?: "conductor" | "central";
}

const EMPRESA = "TVL VIP Transfers";

/** Texto del mensaje (es/en). Las piezas que faltan (ETA, enlace, vehículo) se omiten sin dejar huecos raros. */
export function mensajeAviso(tipo: TipoAviso, d: DatosAviso): string {
  if (d.emisor === "central") return mensajeCentral(tipo, d);
  const en = d.idioma === "en";
  const cliente = nombreDePila(d.cliente);
  const conductor = nombreDePila(d.conductor);
  const hola = en ? `Hello${cliente ? ` ${cliente}` : ""}, ` : `Hola${cliente ? ` ${cliente}` : ""}, `;
  const soy = conductor ? (en ? `this is ${conductor} from ${EMPRESA}. ` : `soy ${conductor} de ${EMPRESA}. `) : (en ? `this is ${EMPRESA}. ` : `te escribimos de ${EMPRESA}. `);
  const enlace = d.enlace?.trim() || null;
  const vehiculo = [d.modelo?.trim(), d.matricula?.trim()].filter(Boolean).join(" · ");
  const min = d.minutos != null && Number.isFinite(d.minutos) && d.minutos > 0 ? Math.round(d.minutos) : null;
  switch (tipo) {
    case "en_camino":
      return en
        ? `${hola}${soy}I'm on my way to pick you up${d.hora ? `; estimated arrival ${d.hora}` : ""}.${enlace ? ` Follow me live: ${enlace}` : ""}`
        : `${hola}${soy}Voy de camino a recogerte${d.hora ? `; llegada estimada ${d.hora}` : ""}.${enlace ? ` Sígueme en directo: ${enlace}` : ""}`;
    case "retraso":
      return en
        ? `${hola}${soy}I'll be ${min ? `about ${min} min ` : ""}late${d.hora ? ` (approx. ${d.hora})` : ""}. Sorry for the inconvenience.${enlace ? ` ${enlace}` : ""}`
        : `${hola}${soy}Llegaré con ${min ? `unos ${min} min de ` : ""}retraso${d.hora ? ` (aprox. ${d.hora})` : ""}. Disculpa las molestias.${enlace ? ` ${enlace}` : ""}`;
    case "llegado":
      return en
        ? `${hola}${soy}I'm already at the pick-up point.${vehiculo ? ` Vehicle ${vehiculo}.` : ""}`
        : `${hola}${soy}Ya estoy en el punto de recogida.${vehiculo ? ` Vehículo ${vehiculo}.` : ""}`;
    case "reasignacion":
      return en
        ? `${hola}${soy}Something unexpected has come up and I won't be able to do your transfer. Our dispatch team will assign you another driver shortly; we'll keep you posted.`
        : `${hola}${soy}He tenido un imprevisto y no podré hacer tu traslado. La central te asignará otro conductor en breve; te avisaremos.`;
  }
}

/** Mismos avisos enviados por la central (en tercera persona: «Tu conductor Marc va de camino…»). */
function mensajeCentral(tipo: TipoAviso, d: DatosAviso): string {
  const en = d.idioma === "en";
  const cliente = nombreDePila(d.cliente);
  const conductor = nombreDePila(d.conductor);
  const hola = en ? `Hello${cliente ? ` ${cliente}` : ""}, this is ${EMPRESA}. ` : `Hola${cliente ? ` ${cliente}` : ""}, te escribimos de ${EMPRESA}. `;
  const tu = en ? `Your driver${conductor ? ` ${conductor}` : ""}` : `Tu conductor${conductor ? ` ${conductor}` : ""}`;
  const enlace = d.enlace?.trim() || null;
  const vehiculo = [d.modelo?.trim(), d.matricula?.trim()].filter(Boolean).join(" · ");
  const min = d.minutos != null && Number.isFinite(d.minutos) && d.minutos > 0 ? Math.round(d.minutos) : null;
  switch (tipo) {
    case "en_camino":
      return en
        ? `${hola}${tu} is on the way to pick you up${d.hora ? `; estimated arrival ${d.hora}` : ""}.${enlace ? ` Follow the car live: ${enlace}` : ""}`
        : `${hola}${tu} va de camino a recogerte${d.hora ? `; llegada estimada ${d.hora}` : ""}.${enlace ? ` Síguelo en directo: ${enlace}` : ""}`;
    case "retraso":
      return en
        ? `${hola}${tu} will be ${min ? `about ${min} min ` : ""}late${d.hora ? ` (approx. ${d.hora})` : ""}. Sorry for the inconvenience.${enlace ? ` ${enlace}` : ""}`
        : `${hola}${tu} llegará con ${min ? `unos ${min} min de ` : ""}retraso${d.hora ? ` (aprox. ${d.hora})` : ""}. Disculpa las molestias.${enlace ? ` ${enlace}` : ""}`;
    case "llegado":
      return en
        ? `${hola}${tu} is already at the pick-up point.${vehiculo ? ` Vehicle ${vehiculo}.` : ""}`
        : `${hola}${tu} ya está en el punto de recogida.${vehiculo ? ` Vehículo ${vehiculo}.` : ""}`;
    case "reasignacion":
      return en
        ? `${hola}Your driver has had an unexpected problem and won't be able to do your transfer. We'll assign you another driver shortly and keep you posted.`
        : `${hola}Tu conductor ha tenido un imprevisto y no podrá hacer tu traslado. Te asignaremos otro conductor en breve; te avisaremos.`;
  }
}

/** https://wa.me/34600000000?text=… (null sin teléfono válido). */
export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const n = normalizarTelefono(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

/** sms:+34600000000?body=… (alternativa sin WhatsApp; iOS y Android aceptan «?body=»). */
export function enlaceSms(telefono: string | null | undefined, texto: string): string | null {
  const n = normalizarTelefono(telefono);
  return n ? `sms:+${n}?body=${encodeURIComponent(texto)}` : null;
}

/** Motivo del evento `aviso_cliente`: «en_camino» (WhatsApp) o «en_camino|sms». */
export const motivoAviso = (tipo: TipoAviso, canal: CanalAviso = "whatsapp") => (canal === "whatsapp" ? tipo : `${tipo}|${canal}`);
export function leerMotivoAviso(m: string | null | undefined): { tipo: TipoAviso; canal: CanalAviso } | null {
  const [t, c] = (m ?? "").trim().split("|");
  if (!(TIPOS_AVISO as readonly string[]).includes(t)) return null;
  return { tipo: t as TipoAviso, canal: c === "sms" ? "sms" : "whatsapp" };
}

/** Qué avisos tiene el conductor en cada estado (la reasignación, solo tras devolver el servicio). */
export function avisosDisponibles(estado: string): TipoAviso[] {
  if (estado === "aceptado" || estado === "en_camino") return ["en_camino", "retraso", "llegado"];
  return [];
}

/** Avisos de la central: los del conductor y, si un conductor lo devolvió y aún no hay otro, el cambio de conductor. */
export function avisosCentral(estado: string, ultimaIncidencia: string | null | undefined): TipoAviso[] {
  const base = avisosDisponibles(estado);
  if ((estado === "pendiente" || estado === "asignado") && (ultimaIncidencia ?? "").startsWith("devuelto")) return ["reasignacion"];
  return base;
}

/**
 * Hora estimada de llegada y minutos de retraso para el mensaje, con la ETA del mapa (s) y el contador de
 * puntualidad: sin ETA, la hora es null; el retraso sale del contador (≥ 1 min) o, si no va tarde, null.
 */
export function estimacionAviso(e: { estado: string; recogida: string; ahora: number; etaS?: number | null }): { hora: string | null; minutos: number | null } {
  const p = calcularPuntualidad({ estado: e.estado, recogida: e.recogida, ahora: e.ahora, etaS: e.etaS ?? null });
  const hora = p.llegadaEstimada != null ? horaAviso(p.llegadaEstimada) : null;
  return { hora, minutos: p.estado === "tarde" && p.minutosRetraso > 0 ? p.minutosRetraso : null };
}
