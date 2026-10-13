import { leerMotivoSubcontratar } from "./capacidad";
import type { EstadoServicio, Servicio } from "./tipos";

type ServAlerta = Pick<Servicio, "estado" | "conductor_id" | "ultima_incidencia" | "subcontratar" | "pasajeros" | "maletas"> & { fecha_hora_recogida?: string };

const fmtHora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
/** «🔁 Marc ha devuelto el servicio de las 15:00: Avería» (ultima_incidencia «devuelto: Avería»). */
export function textoDevuelto(s: { ultima_incidencia: string | null; fecha_hora_recogida?: string }, quien?: string | null): string {
  const motivo = (s.ultima_incidencia ?? "").replace(/^devuelto:\s*/, "").trim();
  const h = s.fecha_hora_recogida ? ` de las ${fmtHora.format(new Date(s.fecha_hora_recogida))}` : "";
  return `🔁 ${quien?.trim() || "El conductor"} ha devuelto el servicio${h}${motivo ? `: ${motivo}` : ""}`;
}

/** «↩ Servicio de las 16:00 quitado al conductor para reasignar: Ausencia: vacaciones» (ultima_incidencia «desasignado: …»). */
export function textoDesasignado(s: { ultima_incidencia: string | null; fecha_hora_recogida?: string }): string {
  const motivo = (s.ultima_incidencia ?? "").replace(/^desasignado:\s*/, "").trim();
  const h = s.fecha_hora_recogida ? ` de las ${fmtHora.format(new Date(s.fecha_hora_recogida))}` : "";
  return `↩ Servicio${h} quitado al conductor: reasígnalo${motivo ? ` (${motivo})` : ""}`;
}

/** Título y texto legible de una alerta (mismos textos que la columna de alertas de la central web). */
export function textoAlertaCentral(s: ServAlerta, nombreConductor: (id: string | null) => string, devueltoPor?: string | null): { titulo: string; texto: string } {
  if (s.subcontratar && s.estado === "pendiente") {
    const razon = leerMotivoSubcontratar(s.ultima_incidencia);
    return { titulo: "Subcontratar", texto: `Subcontratar (${s.pasajeros} pax, ${s.maletas} maletas)${razon ? `: ${razon}` : ""}` };
  }
  const inc = s.ultima_incidencia ?? "";
  if (inc.startsWith("rechazado")) return { titulo: "Rechazado", texto: `Rechazado por ${nombreConductor(s.conductor_id)}: ${inc.replace(/^rechazado:\s*/, "")}` };
  if (inc.startsWith("devuelto")) return { titulo: "🔁 Devuelto", texto: textoDevuelto(s, devueltoPor) };
  if (inc.startsWith("desasignado")) return { titulo: "↩ Reasignar", texto: textoDesasignado(s) };
  if (inc === "expirado") return { titulo: "Sin respuesta", texto: "Plazo vencido: sigue asignado, el conductor aún puede aceptarlo o puedes reasignarlo" };
  if (inc === "nuevo") return { titulo: "Reserva nueva", texto: "Reserva nueva" };
  return { titulo: "Aviso", texto: inc || "Incidencia" };
}

type ServGrupo = Pick<Servicio, "id" | "estado" | "fecha_hora_recogida">;

/** Grupos de trabajo de la central (chips de filtro en la app y en la web). */
export type GrupoCentral = "sin_asignar" | "esperando" | "en_curso" | "terminados";
export type FiltroGrupo = GrupoCentral | "todos";
export const GRUPOS_CENTRAL: readonly { clave: GrupoCentral; titulo: string; estados: readonly EstadoServicio[] }[] = [
  { clave: "sin_asignar", titulo: "Sin asignar", estados: ["pendiente"] },
  { clave: "esperando", titulo: "Esperando respuesta", estados: ["asignado"] },
  { clave: "en_curso", titulo: "En curso", estados: ["aceptado", "en_camino", "recogido"] },
  { clave: "terminados", titulo: "Terminados", estados: ["completado", "cancelado", "subcontratado"] },
];
export const FILTROS_GRUPO: readonly { clave: FiltroGrupo; titulo: string }[] = [{ clave: "todos", titulo: "Todos" }, ...GRUPOS_CENTRAL];

export function esFiltroGrupo(x: unknown): x is FiltroGrupo {
  return FILTROS_GRUPO.some((g) => g.clave === x);
}

/** Estados que incluye un filtro; null = todos. */
export function estadosDeGrupo(f: FiltroGrupo): readonly EstadoServicio[] | null {
  return GRUPOS_CENTRAL.find((g) => g.clave === f)?.estados ?? null;
}

export function grupoDeEstado(estado: string): GrupoCentral | null {
  return GRUPOS_CENTRAL.find((g) => (g.estados as readonly string[]).includes(estado))?.clave ?? null;
}

/** Contadores por grupo a partir de cuántos servicios hay de cada estado. */
export function contarPorGrupo(porEstado: Partial<Record<string, number>>): Record<FiltroGrupo, number> {
  const r: Record<FiltroGrupo, number> = { todos: 0, sin_asignar: 0, esperando: 0, en_curso: 0, terminados: 0 };
  for (const [estado, n] of Object.entries(porEstado)) {
    if (!n) continue;
    r.todos += n;
    const g = grupoDeEstado(estado);
    if (g) r[g] += n;
  }
  return r;
}

export function contarServiciosPorGrupo(servicios: Pick<Servicio, "estado">[]): Record<FiltroGrupo, number> {
  const porEstado: Record<string, number> = {};
  for (const s of servicios) porEstado[s.estado] = (porEstado[s.estado] ?? 0) + 1;
  return contarPorGrupo(porEstado);
}

export function filtrarPorGrupo<T extends Pick<Servicio, "estado">>(servicios: T[], f: FiltroGrupo): T[] {
  const est = estadosDeGrupo(f);
  return est ? servicios.filter((s) => est.includes(s.estado)) : servicios;
}

/** Filtro inicial: «Sin asignar» si hay alguno; si no, «Todos». */
export function filtroInicial(c: Record<FiltroGrupo, number>): FiltroGrupo {
  return c.sin_asignar > 0 ? "sin_asignar" : "todos";
}

export interface GrupoServicios<T> { clave: GrupoCentral; titulo: string; servicios: T[] }

/** Une pendientes (sin conductor) y los de hoy, sin duplicados y ordenados por hora. */
export function serviciosCentralUnicos<T extends ServGrupo>(pendientes: T[], hoy: T[]): T[] {
  const vistos = new Set<string>();
  return [...pendientes, ...hoy].filter((s) => (vistos.has(s.id) ? false : (vistos.add(s.id), true)))
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
}

/** Secciones por grupo (mismo orden que los chips), omitiendo las vacías. */
export function agruparServiciosCentral<T extends ServGrupo>(servicios: T[]): GrupoServicios<T>[] {
  return GRUPOS_CENTRAL.map((g) => ({ clave: g.clave, titulo: g.titulo, servicios: filtrarPorGrupo(servicios, g.clave) }))
    .filter((g) => g.servicios.length > 0);
}

/** «Asignar» si no tiene conductor; «Reasignar» si está asignado y aún no ha salido; null en otro caso. */
export function accionAsignacion(s: Pick<Servicio, "estado" | "conductor_id">): "asignar" | "reasignar" | null {
  if (s.estado === "pendiente") return "asignar";
  if (s.estado === "asignado" || s.estado === "aceptado") return "reasignar";
  return null;
}
