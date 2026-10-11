import { leerMotivoSubcontratar } from "./capacidad";
import type { Servicio } from "./tipos";

type ServAlerta = Pick<Servicio, "estado" | "conductor_id" | "ultima_incidencia" | "subcontratar" | "pasajeros" | "maletas">;

/** Título y texto legible de una alerta (mismos textos que la columna de alertas de la central web). */
export function textoAlertaCentral(s: ServAlerta, nombreConductor: (id: string | null) => string): { titulo: string; texto: string } {
  if (s.subcontratar && s.estado === "pendiente") {
    const razon = leerMotivoSubcontratar(s.ultima_incidencia);
    return { titulo: "Subcontratar", texto: `Subcontratar (${s.pasajeros} pax, ${s.maletas} maletas)${razon ? `: ${razon}` : ""}` };
  }
  const inc = s.ultima_incidencia ?? "";
  if (inc.startsWith("rechazado")) return { titulo: "Rechazado", texto: `Rechazado por ${nombreConductor(s.conductor_id)}: ${inc.replace(/^rechazado:\s*/, "")}` };
  if (inc === "expirado") return { titulo: "Sin respuesta", texto: "Plazo vencido: sigue asignado, el conductor aún puede aceptarlo o puedes reasignarlo" };
  if (inc === "nuevo") return { titulo: "Reserva nueva", texto: "Reserva nueva" };
  return { titulo: "Aviso", texto: inc || "Incidencia" };
}

type ServGrupo = Pick<Servicio, "id" | "estado" | "fecha_hora_recogida">;
export interface GrupoServicios<T> { clave: "pendientes" | "en_curso" | "proximos" | "terminados"; titulo: string; servicios: T[] }

const EN_CURSO = ["en_camino", "recogido"];
const TERMINADOS = ["completado", "cancelado", "subcontratado"];

/** Agrupa pendientes (sin conductor) y los de hoy en secciones ordenadas por hora, sin duplicados. Omite grupos vacíos. */
export function agruparServiciosCentral<T extends ServGrupo>(pendientes: T[], hoy: T[]): GrupoServicios<T>[] {
  const vistos = new Set<string>();
  const unicos = [...pendientes, ...hoy].filter((s) => (vistos.has(s.id) ? false : (vistos.add(s.id), true)))
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
  const grupos: GrupoServicios<T>[] = [
    { clave: "pendientes", titulo: "Sin asignar", servicios: unicos.filter((s) => s.estado === "pendiente") },
    { clave: "en_curso", titulo: "En curso", servicios: unicos.filter((s) => EN_CURSO.includes(s.estado)) },
    { clave: "proximos", titulo: "Asignados", servicios: unicos.filter((s) => s.estado === "asignado" || s.estado === "aceptado") },
    { clave: "terminados", titulo: "Terminados", servicios: unicos.filter((s) => TERMINADOS.includes(s.estado)) },
  ];
  return grupos.filter((g) => g.servicios.length > 0);
}

/** «Asignar» si no tiene conductor; «Reasignar» si está asignado y aún no ha salido; null en otro caso. */
export function accionAsignacion(s: Pick<Servicio, "estado" | "conductor_id">): "asignar" | "reasignar" | null {
  if (s.estado === "pendiente") return "asignar";
  if (s.estado === "asignado" || s.estado === "aceptado") return "reasignar";
  return null;
}
