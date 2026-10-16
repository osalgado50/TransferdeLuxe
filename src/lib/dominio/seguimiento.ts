import { distanciaKm } from "./geo";
import { tiempoTraslado } from "./planificacion";
import { leerMotivoAviso, nombreDePila } from "./avisoCliente";
import type { Punto } from "./tipos";

/**
 * Página pública de seguimiento del traslado (/s/<token>), lógica pura: qué ve el cliente. SOLO estado, posición del
 * coche, hora estimada de llegada, nombre de pila del conductor, modelo y matrícula. Nunca datos del cliente.
 */
export type EstadoSeguimiento = "asignando" | "confirmado" | "de_camino" | "llegando" | "a_bordo" | "finalizado" | "cancelado";
export type IdiomaSeguimiento = "es" | "en";

/** Tras completar o cancelar, la página sigue viva 30 min. */
export const VIGENCIA_TRAS_FIN_MS = 30 * 60_000;
/** Posición más antigua que esto: no se enseña (el coche no está transmitiendo). */
export const POSICION_MAX_EDAD_MS = 30 * 60_000;
/** «Llegando»: a menos de 500 m de la recogida, o a ≤ 2 min según el modelo de traslado. */
export const LLEGANDO_M = 500, LLEGANDO_MIN = 2;
export const REFRESCO_SEGUIMIENTO_MS = 15_000;

export interface EntradaSeguimiento {
  servicio: {
    estado: string; origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
  };
  /** Eventos del servicio (tipo, motivo, fecha). */
  eventos: { tipo: string; motivo?: string | null; creado_en: string }[];
  posicion: { lat: number; lng: number; registrado_en: string } | null;
  conductor: string | null;
  vehiculo: { modelo: string | null; matricula: string | null } | null;
  ahora: Date;
}

export interface Seguimiento {
  estado: EstadoSeguimiento;
  posicion: { lat: number; lng: number; haceS: number } | null;
  eta: { objetivo: "recogida" | "destino"; minutos: number; hora: string } | null;
  conductor: string | null;
  vehiculo: { modelo: string | null; matricula: string | null } | null;
  actualizado: string;
}
export type ResultadoSeguimiento = { ok: true; datos: Seguimiento } | { ok: false; motivo: "caducado" };

const pt = (lat: number | null, lng: number | null): Punto | null => (lat != null && lng != null ? { lat, lng } : null);
const fmtHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const t = (iso: string) => Date.parse(iso) || 0;

export function calcularSeguimiento(e: EntradaSeguimiento): ResultadoSeguimiento {
  const ahora = e.ahora.getTime();
  const s = e.servicio;
  const ultimo = (tipos: string[]) => e.eventos.filter((x) => tipos.includes(x.tipo)).sort((a, b) => t(b.creado_en) - t(a.creado_en))[0] ?? null;
  const vacio = (estado: EstadoSeguimiento, extra: Partial<Seguimiento> = {}): ResultadoSeguimiento => ({
    ok: true, datos: { estado, posicion: null, eta: null, conductor: null, vehiculo: null, actualizado: e.ahora.toISOString(), ...extra },
  });

  if (s.estado === "completado" || s.estado === "cancelado") {
    const fin = ultimo([s.estado]);
    if (!fin || ahora - t(fin.creado_en) > VIGENCIA_TRAS_FIN_MS) return { ok: false, motivo: "caducado" };
    return vacio(s.estado === "completado" ? "finalizado" : "cancelado");
  }
  // Devuelto por el conductor (o aún sin aceptar): la central está asignando otro; sin posición ni conductor.
  if (s.estado === "pendiente" || s.estado === "asignado") return vacio("asignando");
  if (s.estado !== "aceptado" && s.estado !== "en_camino" && s.estado !== "recogido") return { ok: false, motivo: "caducado" };

  // Aceptado pero sin salir: solo se enseña el coche si el conductor ya avisó al cliente de que va de camino.
  const avisoCamino = ultimo(["aviso_cliente"]);
  const yaSalio = s.estado !== "aceptado" || (!!avisoCamino && leerMotivoAviso(avisoCamino.motivo)?.tipo === "en_camino"
    && t(avisoCamino.creado_en) >= t(ultimo(["aceptado"])?.creado_en ?? "1970-01-01"));
  const conductor = nombreDePila(e.conductor) || null;
  const vehiculo = e.vehiculo && (e.vehiculo.modelo || e.vehiculo.matricula) ? e.vehiculo : null;
  if (!yaSalio) return vacio("confirmado", { conductor, vehiculo });

  const p = e.posicion && ahora - t(e.posicion.registrado_en) <= POSICION_MAX_EDAD_MS ? e.posicion : null;
  const posicion = p ? { lat: p.lat, lng: p.lng, haceS: Math.max(0, Math.round((ahora - t(p.registrado_en)) / 1000)) } : null;
  const aBordo = s.estado === "recogido";
  const objetivo = aBordo ? pt(s.destino_lat, s.destino_lng) : pt(s.origen_lat, s.origen_lng);
  const min = p && objetivo ? tiempoTraslado(p, objetivo) : null;
  const eta = min != null ? { objetivo: aBordo ? "destino" as const : "recogida" as const, minutos: min, hora: fmtHora.format(new Date(ahora + min * 60_000)) } : null;

  let estado: EstadoSeguimiento = aBordo ? "a_bordo" : "de_camino";
  if (!aBordo) {
    const cerca = p && objetivo ? distanciaKm(p, objetivo) * 1000 <= LLEGANDO_M || (min != null && min <= LLEGANDO_MIN) : false;
    const llegando = ultimo(["llegando_recogida"]);
    const salida = ultimo(["en_camino"]);
    if (cerca || (llegando && t(llegando.creado_en) >= t(salida?.creado_en ?? "1970-01-01"))) estado = "llegando";
  }
  return { ok: true, datos: { estado, posicion, eta, conductor, vehiculo, actualizado: e.ahora.toISOString() } };
}

/** Idioma del cliente por `Accept-Language`: el primero (por preferencia q) que sea es o en; por defecto, es. */
export function idiomaPreferido(cabecera: string | null | undefined): IdiomaSeguimiento {
  const lista = (cabecera ?? "").split(",").map((x, i) => {
    const [tag, ...params] = x.trim().toLowerCase().split(";");
    const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? "1");
    return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, i };
  }).filter((x) => x.tag).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of lista) {
    if (tag === "en" || tag.startsWith("en-")) return "en";
    if (tag === "es" || tag.startsWith("es-") || tag === "ca" || tag.startsWith("ca-")) return "es";
  }
  return "es";
}

export const TEXTOS_SEGUIMIENTO: Record<IdiomaSeguimiento, Record<EstadoSeguimiento, { titulo: string; sub: string }> & {
  llegada: string; destino: string; conductor: string; vehiculo: string; actualizado: string; caducado: string; caducadoSub: string;
  sinSenal: string; enDirecto: string; error: string;
}> = {
  es: {
    asignando: { titulo: "Estamos asignando tu conductor", sub: "Te avisaremos en cuanto esté confirmado." },
    confirmado: { titulo: "Tu conductor está confirmado", sub: "Verás el coche en el mapa cuando salga hacia la recogida." },
    de_camino: { titulo: "Tu conductor va de camino", sub: "Sigue el coche en directo." },
    llegando: { titulo: "Tu conductor está llegando", sub: "Prepárate: está muy cerca del punto de recogida." },
    a_bordo: { titulo: "A bordo", sub: "Buen viaje." },
    finalizado: { titulo: "Traslado finalizado", sub: "Gracias por viajar con TransferdeLuxe." },
    cancelado: { titulo: "Traslado cancelado", sub: "Si tienes dudas, contacta con nosotros." },
    llegada: "Llegada estimada a la recogida", destino: "Llegada estimada al destino", conductor: "Conductor", vehiculo: "Vehículo",
    actualizado: "Actualizado", caducado: "Este enlace ya no está activo", caducadoSub: "El seguimiento se desactiva 30 minutos después del traslado.",
    sinSenal: "Sin señal del coche en este momento", enDirecto: "En directo · se actualiza cada 15 s", error: "Sin conexión. Reintentando…",
  },
  en: {
    asignando: { titulo: "We're assigning your driver", sub: "We'll let you know as soon as it's confirmed." },
    confirmado: { titulo: "Your driver is confirmed", sub: "You'll see the car on the map once it heads to the pick-up point." },
    de_camino: { titulo: "Your driver is on the way", sub: "Follow the car live." },
    llegando: { titulo: "Your driver is arriving", sub: "Get ready: they're very close to the pick-up point." },
    a_bordo: { titulo: "On board", sub: "Have a nice trip." },
    finalizado: { titulo: "Transfer completed", sub: "Thank you for travelling with TransferdeLuxe." },
    cancelado: { titulo: "Transfer cancelled", sub: "If you have any questions, please contact us." },
    llegada: "Estimated arrival at pick-up", destino: "Estimated arrival at destination", conductor: "Driver", vehiculo: "Vehicle",
    actualizado: "Updated", caducado: "This link is no longer active", caducadoSub: "Tracking is switched off 30 minutes after the transfer.",
    sinSenal: "No signal from the car right now", enDirecto: "Live · updates every 15 s", error: "No connection. Retrying…",
  },
};

/** Token público: aleatorio largo en base64url (32 bytes → 43 caracteres). */
export const esTokenSeguimiento = (t: string) => /^[A-Za-z0-9_-]{32,64}$/.test(t);
