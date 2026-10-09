import type { EstadoServicio } from "@/lib/dominio/tipos";

const MAPA: Record<EstadoServicio, [string, string]> = {
  pendiente: ["Pendiente", "bg-amber-500/20 text-amber-300"],
  asignado: ["Esperando respuesta", "bg-sky-500/20 text-sky-300"],
  aceptado: ["Aceptado", "bg-blue-500/20 text-blue-300"],
  en_camino: ["En camino", "bg-violet-500/20 text-violet-300"],
  recogido: ["Con pasajeros", "bg-indigo-500/20 text-indigo-300"],
  completado: ["Completado", "bg-green-500/20 text-green-300"],
  cancelado: ["Cancelado", "bg-slate-500/20 text-slate-400"],
  subcontratado: ["Subcontratado", "bg-orange-500/20 text-orange-300"],
};

export default function EstadoBadge({ estado }: { estado: EstadoServicio }) {
  const [t, c] = MAPA[estado];
  return <span data-estado={estado} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{t}</span>;
}
