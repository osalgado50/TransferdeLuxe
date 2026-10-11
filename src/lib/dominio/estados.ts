import { puedeConducir, type EstadoServicio, type Rol } from "./tipos";

export type Accion = "asignar" | "reasignar" | "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "cancelar" | "subcontratar";
/** `conduce`: operador que también conduce (puede hacer las acciones de conductor sobre lo suyo). */
export interface Actor { rol: Rol; esAsignado: boolean; conduce?: boolean }
export type ResultadoTransicion = { ok: true; nuevo: EstadoServicio; evento: string } | { ok: false; error: string };

interface Regla { desde: EstadoServicio[]; hacia: EstadoServicio; quien: Rol; evento: string }

const REGLAS: Record<Accion, Regla> = {
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
