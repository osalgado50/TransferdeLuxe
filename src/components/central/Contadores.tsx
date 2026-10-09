import { diaMadrid } from "@/lib/dominio/geo";
import type { Servicio } from "@/lib/dominio/tipos";

export default function Contadores({ servicios }: { servicios: Servicio[] }) {
  const hoy = diaMadrid(new Date());
  const delDia = servicios.filter((s) => diaMadrid(s.fecha_hora_recogida) === hoy);
  const n = (...e: string[]) => delDia.filter((s) => e.includes(s.estado)).length;
  const items: [string, number][] = [
    ["Pendientes", n("pendiente")], ["Esperando respuesta", n("asignado")],
    ["En curso", n("aceptado", "en_camino", "recogido")], ["Completados", n("completado")],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([t, v]) => (
        <div key={t} data-contador={t} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-3xl font-semibold text-amber-400">{v}</p>
          <p className="text-sm text-slate-400">{t}</p>
        </div>
      ))}
    </div>
  );
}
