import { COLOR_INDICADOR, type IndicadorPuntualidad } from "@/lib/dominio/puntualidadCentral";

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

/** Semáforo de llegada a la recogida: verde a tiempo, naranja justo, rojo retraso; «sin GPS» en gris si va por plan. */
export default function ChipPuntualidad({ ind, className = "" }: { ind?: IndicadorPuntualidad | null; className?: string }) {
  if (!ind) return null;
  const c = COLOR_INDICADOR[ind.estado];
  const titulo = ind.llegadaEstimada ? `Llegada estimada ${hora.format(new Date(ind.llegadaEstimada))}${ind.conGps ? " (GPS)" : " (por plan, sin GPS reciente)"}` : ind.texto;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} title={titulo}>
      <span data-puntualidad={ind.estado} style={{ backgroundColor: c.fondo, color: c.texto }}
        className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold">{ind.texto}</span>
      {!ind.conGps && ind.estado !== "sin_gps" && <span className="whitespace-nowrap rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">sin GPS</span>}
    </span>
  );
}
