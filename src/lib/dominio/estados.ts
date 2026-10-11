import { DESHACER, EVENTO_DESHECHO } from "./deshacer";
import { puedeConducir, type EstadoServicio, type Rol } from "./tipos";

export type Accion = "asignar" | "reasignar" | "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "cancelar" | "subcontratar" | "deshacer";
/** `conduce`: operador que también conduce (puede hacer las acciones de conductor sobre lo suyo). */
/** `central`: la acción llega desde la central (ficha web o modo central de la app), no desde la pantalla del conductor. */
export interface Actor { rol: Rol; esAsignado: boolean; conduce?: boolean; central?: boolean }
export type ResultadoTransicion = { ok: true; nuevo: EstadoServicio; evento: string } | { ok: false; error: string };

interface Regla { desde: EstadoServicio[]; hacia: EstadoServicio; quien: Rol; evento: string }

const REGLAS: Record<Exclude<Accion, "deshacer">, Regla> = {
  asignar:      { desde: ["pendiente"], hacia: "asignado", quien: "operador", evento: "asignado" },
  reasignar:    { desde: ["asignado", "aceptado"], hacia: "asignado", quien: "operador", evento: "reasignado" },
  cancelar:     { desde: ["pendiente", "asignado", "aceptado"], hacia: "cancelado", quien: "operador", evento: "cancelado" },
  subcontratar: { desde: ["pendiente"], hacia: "subcontratado", quien: "operador", evento: "subcontratado" },
  aceptar:      { desde: ["asignado"], hacia: "aceptado", quien: "conductor", evento: "aceptado" },
  rechazar:     { desde: ["asignado"], hacia: "pendiente", quien: "conductor", evento: "rechazado" },
  salir:        { desde: ["aceptado"], hacia: "en_camino", quien: "conductor", evento: "en_camino" },
  cargar:       { desde: ["en_camino"], hacia: "recogido", quien: "conductor", evento: "recogido" },
  descargar:    { desde: ["recogido"], hacia: "completado", quien: "conductor", evento: "completado" },
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
