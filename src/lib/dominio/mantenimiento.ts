// Semáforo de mantenimiento de flota: vencido = rojo, < 30 días o < 1.000 km = amarillo, resto verde.
export type Semaforo = "rojo" | "amarillo" | "verde" | "sin_datos";
export const DIAS_AVISO = 30;
export const KM_AVISO = 1000;

export interface PlanVehiculo {
  itv_fecha: string | null;
  seguro_vence: string | null;
  revision_fecha: string | null;
  revision_km: number | null;
}

export interface EstadoItem { clave: "itv" | "seguro" | "revision_fecha" | "revision_km"; etiqueta: string; semaforo: Semaforo; detalle: string }

const DIA_MS = 86_400_000;
/** Días enteros desde hoy (YYYY-MM-DD) hasta la fecha (YYYY-MM-DD); negativo si ya pasó. */
export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / DIA_MS);
}

export function semaforoFecha(fecha: string | null, hoy: string): Semaforo {
  if (!fecha) return "sin_datos";
  const d = diasHasta(fecha, hoy);
  return d < 0 ? "rojo" : d < DIAS_AVISO ? "amarillo" : "verde";
}

export function semaforoKm(revisionKm: number | null, kmActuales: number): Semaforo {
  if (revisionKm == null) return "sin_datos";
  const q = revisionKm - kmActuales;
  return q <= 0 ? "rojo" : q < KM_AVISO ? "amarillo" : "verde";
}

const ORDEN: Semaforo[] = ["rojo", "amarillo", "verde", "sin_datos"];
/** El peor de varios semáforos (sin_datos solo si no hay ninguno con datos). */
export function peor(s: Semaforo[]): Semaforo {
  for (const x of ORDEN) if (s.includes(x)) return x;
  return "sin_datos";
}

function textoDias(d: number): string {
  if (d < 0) return `vencido hace ${-d} ${-d === 1 ? "día" : "días"}`;
  if (d === 0) return "vence hoy";
  return `en ${d} ${d === 1 ? "día" : "días"}`;
}

export function estadoVehiculo(plan: PlanVehiculo | null, kmActuales: number, hoy: string): { global: Semaforo; items: EstadoItem[] } {
  const p = plan ?? { itv_fecha: null, seguro_vence: null, revision_fecha: null, revision_km: null };
  const fecha = (clave: EstadoItem["clave"], etiqueta: string, f: string | null): EstadoItem =>
    ({ clave, etiqueta, semaforo: semaforoFecha(f, hoy), detalle: f ? textoDias(diasHasta(f, hoy)) : "sin fecha" });
  const items: EstadoItem[] = [
    fecha("itv", "ITV", p.itv_fecha),
    fecha("seguro", "Seguro", p.seguro_vence),
    fecha("revision_fecha", "Revisión (fecha)", p.revision_fecha),
    {
      clave: "revision_km", etiqueta: "Revisión (km)", semaforo: semaforoKm(p.revision_km, kmActuales),
      detalle: p.revision_km == null ? "sin km" : p.revision_km - kmActuales <= 0
        ? `pasada por ${(kmActuales - p.revision_km).toLocaleString("es-ES")} km` : `faltan ${(p.revision_km - kmActuales).toLocaleString("es-ES")} km`,
    },
  ];
  return { global: peor(items.map((i) => i.semaforo)), items };
}

/** Avisos (rojo/amarillo) para el panel. */
export function avisosMantenimiento(vehiculos: { id: string; matricula: string; km_actuales: number; plan: PlanVehiculo | null }[], hoy: string) {
  return vehiculos.flatMap((v) => estadoVehiculo(v.plan, v.km_actuales, hoy).items
    .filter((i) => i.semaforo === "rojo" || i.semaforo === "amarillo")
    .map((i) => ({ vehiculoId: v.id, matricula: v.matricula, ...i })))
    .sort((a, b) => ORDEN.indexOf(a.semaforo) - ORDEN.indexOf(b.semaforo));
}
