import { nombreTipoIncidencia } from "./incidencias";
import { esIncidenciaGrave } from "./actividad";
import { zonaCercana } from "./zonas";

/** Lógica pura de los avisos push a la central (vigilante del servidor). */
export interface AvisoCentral { titulo: string; cuerpo: string; data: { tipo: string; servicioId?: string; incidenciaId?: string; grave?: boolean } }
export interface ServicioAviso { id: string; origen_texto: string; destino_texto: string; fecha_hora_recogida: string; origen_pedido: string; conductor_id?: string | null }
export interface EventoAviso { id: number; servicio_id: string; tipo: string; actor_id: string | null; motivo: string | null }
export interface IncidenciaAviso { id?: string; conductor_id: string; servicio_id: string | null; tipo: string; descripcion: string; lat?: number | null; lng?: number | null }
export interface RevisionAviso { conductor_id: string; vehiculo_id: string }
export interface Entrada {
  eventos: EventoAviso[]; incidencias: IncidenciaAviso[]; revisiones: RevisionAviso[];
  servicios: Map<string, ServicioAviso>; nombres: Map<string, string>; matriculas: Map<string, string>;
  /** Última posición de cada conductor: zona de la incidencia si no trae coordenadas. */
  posiciones?: Map<string, { lat: number; lng: number }>;
}

export const MAX_AVISOS = 8;

/** «Aeropuerto de Reus, Tarragona» → «Aeropuerto de Reus» (máx. 28 caracteres). */
export function lugarCorto(t: string): string {
  const s = t.split(",")[0].trim();
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
}
export function horaMadrid(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
}
const trayecto = (s: ServicioAviso) => `${lugarCorto(s.origen_texto)} → ${lugarCorto(s.destino_texto)} ${horaMadrid(s.fecha_hora_recogida)}`;
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function construirAvisos(e: Entrada): AvisoCentral[] {
  const out: AvisoCentral[] = [];
  const nombre = (id: string | null) => (id && e.nombres.get(id)) || "un conductor";
  for (const ev of e.eventos) {
    const s = e.servicios.get(ev.servicio_id);
    if (!s) continue;
    const data = { tipo: ev.tipo, servicioId: s.id };
    if (ev.tipo === "creado" && s.origen_pedido === "web") out.push({ titulo: "Reserva nueva", cuerpo: trayecto(s), data: { ...data, tipo: "reserva_nueva" } });
    else if (ev.tipo === "rechazado") out.push({ titulo: `Rechazado por ${nombre(ev.actor_id)}${ev.motivo ? `: ${recortar(ev.motivo, 60)}` : ""}`, cuerpo: trayecto(s), data });
    else if (ev.tipo === "expirado") out.push({ titulo: "Sin respuesta del conductor", cuerpo: trayecto(s), data });
    else if (ev.tipo === "aceptado") out.push({ titulo: `${nombre(ev.actor_id)} ha aceptado`, cuerpo: trayecto(s), data });
    else if (ev.tipo === "retraso_recogida") {
      // Lo detecta el servidor (actor null): conductor asignado y zona de su última posición.
      const cid = s.conductor_id ?? null;
      const p = cid ? e.posiciones?.get(cid) : undefined;
      const zona = p ? zonaCercana(p.lat, p.lng)?.texto ?? null : null;
      out.push({ titulo: `⏰ ${nombre(cid)} llega tarde a la recogida`, cuerpo: [trayecto(s), zona].filter(Boolean).join(" · "), data });
    }
  }
  // Lo grave (avería, accidente) va primero (nunca se pierde en el resumen) y con todos los datos: tipo, conductor y zona.
  const graves: AvisoCentral[] = [];
  for (const i of e.incidencias) {
    const s = i.servicio_id ? e.servicios.get(i.servicio_id) : undefined;
    const p = i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : e.posiciones?.get(i.conductor_id);
    const zona = p ? zonaCercana(p.lat, p.lng)?.texto ?? null : null;
    const desc = i.descripcion.trim() ? recortar(i.descripcion.trim(), 80) : null;
    const data = { tipo: "incidencia", ...(i.servicio_id ? { servicioId: i.servicio_id } : {}), ...(i.id ? { incidenciaId: i.id } : {}) };
    if (esIncidenciaGrave(i.tipo)) {
      graves.push({
        titulo: ["⚠ " + nombreTipoIncidencia(i.tipo).toUpperCase(), nombre(i.conductor_id), zona].filter(Boolean).join(" · "),
        cuerpo: [desc, s ? trayecto(s) : null].filter(Boolean).join(" · ") || "Llama al conductor",
        data: { ...data, grave: true },
      });
      continue;
    }
    const cuerpo = [nombre(i.conductor_id), zona, desc, s ? trayecto(s) : null].filter(Boolean).join(" · ");
    out.push({ titulo: `Incidencia: ${nombreTipoIncidencia(i.tipo)}`, cuerpo, data });
  }
  out.unshift(...graves);
  for (const r of e.revisiones) {
    out.push({ titulo: "Checklist con fallos", cuerpo: `${nombre(r.conductor_id)} · ${e.matriculas.get(r.vehiculo_id) ?? "vehículo"}`, data: { tipo: "checklist" } });
  }
  if (out.length <= MAX_AVISOS) return out;
  const resto = out.length - (MAX_AVISOS - 1);
  return [...out.slice(0, MAX_AVISOS - 1), { titulo: `${resto} avisos más en la central`, cuerpo: "Abre la central para verlos", data: { tipo: "resumen" } }];
}
