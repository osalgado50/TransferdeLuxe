// Agregaciones puras para /central/informes.
import { distanciaKm } from "./geo";
import { consumoMedioL100, type TicketCalculo } from "./combustible";
import { celdaCsv } from "./csv";

export const FACTOR_CARRETERA = 1.3;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ServicioInforme {
  id: string; estado: string; pasajeros: number; conductor_id: string | null; vehiculo_id: string | null; fecha_hora_recogida: string;
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
}
export interface FiltroInforme { mes: string; conductor?: string; vehiculo?: string }

/** Km estimados del servicio: línea recta × factor de carretera; null sin coordenadas. */
export function kmEstimados(s: Pick<ServicioInforme, "origen_lat" | "origen_lng" | "destino_lat" | "destino_lng">): number | null {
  if (s.origen_lat == null || s.origen_lng == null || s.destino_lat == null || s.destino_lng == null) return null;
  return r1(distanciaKm({ lat: s.origen_lat, lng: s.origen_lng }, { lat: s.destino_lat, lng: s.destino_lng }) * FACTOR_CARRETERA);
}

/** Mes (YYYY-MM) de una fecha ISO en hora de Madrid. */
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" });
export function mesMadrid(iso: string): string { return iso.length <= 10 ? iso.slice(0, 7) : fmt.format(new Date(iso)); }

export function filtrar<T extends { conductor_id: string | null; vehiculo_id?: string | null }>(xs: T[], f: FiltroInforme, fecha: (x: T) => string): T[] {
  return xs.filter((x) => mesMadrid(fecha(x)) === f.mes && (!f.conductor || x.conductor_id === f.conductor) && (!f.vehiculo || x.vehiculo_id === f.vehiculo));
}

export interface FilaInforme { id: string; servicios: number; pasajeros: number; km: number; sinCoordenadas: number; litros: number; gasto: number; l100: number | null; rechazos: number; incidencias: number }

export interface EntradaInforme {
  servicios: ServicioInforme[];          // ya filtrados por mes/conductor/vehículo
  tickets: (TicketCalculo & { conductor_id: string })[]; // ya filtrados
  rechazos: { conductor_id: string | null }[];
  incidencias: { conductor_id: string | null; vehiculo_id?: string | null }[];
}

function vacia(id: string): FilaInforme { return { id, servicios: 0, pasajeros: 0, km: 0, sinCoordenadas: 0, litros: 0, gasto: 0, l100: null, rechazos: 0, incidencias: 0 }; }

/** Agrupa por "conductor" o "vehiculo". Solo cuenta servicios completados. */
export function agrupar(e: EntradaInforme, por: "conductor" | "vehiculo"): FilaInforme[] {
  const m = new Map<string, FilaInforme>();
  const fila = (id: string | null | undefined) => { const k = id ?? "—"; if (!m.has(k)) m.set(k, vacia(k)); return m.get(k)!; };
  for (const s of e.servicios) {
    if (s.estado !== "completado") continue;
    const f = fila(por === "conductor" ? s.conductor_id : s.vehiculo_id);
    f.servicios++; f.pasajeros += s.pasajeros;
    const km = kmEstimados(s);
    if (km == null) f.sinCoordenadas++; else f.km += km;
  }
  const tPor = new Map<string, TicketCalculo[]>();
  for (const t of e.tickets) {
    const k = por === "conductor" ? t.conductor_id : t.vehiculoId;
    const f = fila(k); f.litros += t.litros; f.gasto += t.importe;
    tPor.set(k, [...(tPor.get(k) ?? []), t]);
  }
  if (por === "vehiculo") for (const [k, ts] of tPor) fila(k).l100 = consumoMedioL100(ts);
  if (por === "conductor") for (const r of e.rechazos) fila(r.conductor_id).rechazos++;
  for (const i of e.incidencias) fila(por === "conductor" ? i.conductor_id : i.vehiculo_id).incidencias++;
  return [...m.values()].map((f) => ({ ...f, km: r1(f.km), litros: r2(f.litros), gasto: r2(f.gasto) })).sort((a, b) => b.servicios - a.servicios || a.id.localeCompare(b.id));
}

export function totales(filas: FilaInforme[]) {
  const t = filas.reduce((a, f) => ({ servicios: a.servicios + f.servicios, pasajeros: a.pasajeros + f.pasajeros, km: a.km + f.km, litros: a.litros + f.litros,
    gasto: a.gasto + f.gasto, rechazos: a.rechazos + f.rechazos, incidencias: a.incidencias + f.incidencias, sinCoordenadas: a.sinCoordenadas + f.sinCoordenadas }),
  { servicios: 0, pasajeros: 0, km: 0, litros: 0, gasto: 0, rechazos: 0, incidencias: 0, sinCoordenadas: 0 });
  return { ...t, km: r1(t.km), litros: r2(t.litros), gasto: r2(t.gasto) };
}

/** Servicios completados por día del mes (para el gráfico). */
export function serviciosPorDia(servicios: ServicioInforme[], mes: string): { dia: string; servicios: number }[] {
  const [y, mm] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  const c = new Array<number>(dias).fill(0);
  const fmtD = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
  for (const s of servicios) {
    if (s.estado !== "completado") continue;
    const d = fmtD.format(new Date(s.fecha_hora_recogida));
    if (d.startsWith(mes)) c[Number(d.slice(8, 10)) - 1]++;
  }
  return c.map((n, i) => ({ dia: String(i + 1), servicios: n }));
}

/** CSV con separador ";" (Excel en español), coma decimal, fórmulas neutralizadas y BOM. */
export function aCsv(cabecera: string[], filas: (string | number | null)[][]): string {
  return "\ufeff" + [cabecera, ...filas].map((f) => f.map(celdaCsv).join(";")).join("\r\n") + "\r\n";
}
