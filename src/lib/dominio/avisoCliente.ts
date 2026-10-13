/**
 * Aviso al cliente por WhatsApp «un toque» (sin API, gratis) o SMS: lógica pura compartida por la app nativa, la PWA
 * y la central. Se abre el chat del cliente con el texto ya escrito y el humano pulsa «enviar».
 */
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
}

const EMPRESA = "TVL VIP Transfers";

/** Texto del mensaje (es/en). Las piezas que faltan (ETA, enlace, vehículo) se omiten sin dejar huecos raros. */
export function mensajeAviso(tipo: TipoAviso, d: DatosAviso): string {
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
    case "retraso": {
      const cuanto = en
        ? `I'll be ${min ? `about ${min} min ` : ""}late${d.hora ? ` (approx. ${d.hora})` : ""}`
        : `llegaré con ${min ? `unos ${min} min de ` : ""}retraso${d.hora ? ` (aprox. ${d.hora})` : ""}`;
      return en
        ? `${hola}${soy}${cuanto[0].toUpperCase()}${cuanto.slice(1)}. Sorry for the inconvenience.${enlace ? ` ${enlace}` : ""}`
        : `${hola}${soy}${cuanto[0].toUpperCase()}${cuanto.slice(1)}. Disculpa las molestias.${enlace ? ` ${enlace}` : ""}`;
    }
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

/** Qué avisos tienen sentido en cada estado (conductor y central). La reasignación solo tras devolver el servicio. */
export function avisosDisponibles(estado: string): TipoAviso[] {
  if (estado === "aceptado" || estado === "en_camino") return ["en_camino", "retraso", "llegado"];
  return [];
}
