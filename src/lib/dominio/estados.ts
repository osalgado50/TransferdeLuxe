import { DESHACER, EVENTO_DESHECHO } from "./deshacer";
import { puedeConducir, type EstadoServicio, type Rol } from "./tipos";

export type Accion = "asignar" | "reasignar" | "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "cancelar" | "subcontratar" | "deshacer" | "devolver" | "desasignar";
/** `conduce`: operador que también conduce (puede hacer las acciones de conductor sobre lo suyo). */
/** `central`: la acción llega desde la central (ficha web o modo central de la app), no desde la pantalla del conductor. */
export interface Actor { rol: Rol; esAsignado: boolean; conduce?: boolean; central?: boolean }
export type ResultadoTransicion = { ok: true; nuevo: EstadoServicio; evento: string } | { ok: false; error: string };

interface Regla { desde: EstadoServicio[]; hacia: EstadoServicio; quien: Rol; evento: string }

const REGLAS: Record<Exclude<Accion, "deshacer">, Regla> = {
  asignar:      { desde: ["pendiente"], hacia: "asignado", quien: "operador", evento: "asignado" },
  reasignar:    { desde: ["asignado", "aceptado"], hacia: "asignado", quien: "operador", evento: "reasignado" },
  cancelar:     { desde: ["pendiente", "asignado", "aceptado"], hacia: "cancelado", quien: "operador", evento: "cancelado" },
  // También desde «asignado» (plazo vencido sin respuesta: el servicio sigue asignado y la central decide subcontratar).
  subcontratar: { desde: ["pendiente", "asignado"], hacia: "subcontratado", quien: "operador", evento: "subcontratado" },
  aceptar:      { desde: ["asignado"], hacia: "aceptado", quien: "conductor", evento: "aceptado" },
  rechazar:     { desde: ["asignado"], hacia: "pendiente", quien: "conductor", evento: "rechazado" },
  salir:        { desde: ["aceptado"], hacia: "en_camino", quien: "conductor", evento: "en_camino" },
  cargar:       { desde: ["en_camino"], hacia: "recogido", quien: "conductor", evento: "recogido" },
  descargar:    { desde: ["recogido"], hacia: "completado", quien: "conductor", evento: "completado" },
  // «No puedo hacer este servicio»: el conductor asignado lo devuelve a la central (antes de recoger al cliente).
  devolver:     { desde: ["aceptado", "en_camino"], hacia: "pendiente", quien: "conductor", evento: "devuelto" },
  // La central se lo quita al conductor (p. ej. vacaciones) y vuelve a «Sin asignar» con aviso para reasignarlo.
  desasignar:   { desde: ["asignado", "aceptado"], hacia: "pendiente", quien: "operador", evento: "desasignado" },
};

export function transicion(estado: EstadoServicio, accion: Accion, actor: Actor): ResultadoTransicion {
  if (accion === "deshacer") {
    // Conductor asignado (u operador que conduce, sobre lo suyo) desde su pantalla; o la central desde la ficha.
    // La ventana de 10 min y «nadie actuó después» se comprueban con los eventos (comprobarDeshacer).
    if (actor.central ? actor.rol !== "operador" : !puedeConducir(actor)) return { ok: false, error: "No tienes permiso para esta acción" };
    if (!actor.central && !actor.esAsignado) return { ok: false, error: "Este servicio ya no está asignado a ti" };
    const d = DESHACER[estado];
    if (!d) return { ok: false, error: `No se puede «deshacer» un servicio en estado «${estado}»` };
    return { ok: true, nuevo: d.hacia, evento: EVENTO_DESHECHO };
  }
  const regla = REGLAS[accion];
  const permitido = regla.quien === "conductor" ? puedeConducir(actor) : actor.rol === regla.quien;
  if (!permitido) return { ok: false, error: "No tienes permiso para esta acción" };
  if (regla.quien === "conductor" && !actor.esAsignado) return { ok: false, error: "Este servicio ya no está asignado a ti" };
  if (!regla.desde.includes(estado)) return { ok: false, error: `No se puede «${accion}» un servicio en estado «${estado}»` };
  return { ok: true, nuevo: regla.hacia, evento: regla.evento };
}

export const ACCION_SIGUIENTE_CONDUCTOR: Partial<Record<EstadoServicio, { accion: Accion; etiqueta: string }>> = {
  aceptado: { accion: "salir", etiqueta: "Salgo hacia la recogida" },
  en_camino: { accion: "cargar", etiqueta: "CARGA – pasajeros a bordo" },
  recogido: { accion: "descargar", etiqueta: "DESCARGA – servicio terminado" },
};

export const MOTIVOS_RECHAZO = ["Avería", "No llego a tiempo", "Fuera de servicio", "Otro"] as const;
/** Motivos de «No puedo hacer este servicio» (devolver). «Otro» exige escribir el motivo. */
export const MOTIVOS_DEVOLUCION = ["Avería", "Retraso grave", "Emergencia personal", "Demasiados servicios", "La app se ha quedado bloqueada", "Otro"] as const;

/**
 * Cómo se lo devuelve el conductor a la central desde la lista (la ✕ de cada servicio): uno asignado se rechaza, uno
 * aceptado o de camino se devuelve. Con el cliente a bordo (recogido) o ya cerrado, no se puede.
 */
export function accionDevolver(estado: string): "rechazar" | "devolver" | null {
  if (estado === "asignado") return "rechazar";
  if (estado === "aceptado" || estado === "en_camino") return "devolver";
  return null;
}
/** Servicios que «Devolver todos a la central» devolvería (sin repetir). */
export function devolviblesEnBloque<T extends { id: string; estado: string }>(listas: readonly (readonly T[])[]): T[] {
  const vistos = new Set<string>();
  return listas.flat().filter((s) => accionDevolver(s.estado) && !vistos.has(s.id) && vistos.add(s.id));
}
/** Prefijo de `ultima_incidencia` de un servicio devuelto: «devuelto: Avería». */
export const PREFIJO_DEVUELTO = "devuelto";
/** Prefijo de `ultima_incidencia` de un servicio que la central ha quitado al conductor: «desasignado: Ausencia: vacaciones». */
export const PREFIJO_DESASIGNADO = "desasignado";
