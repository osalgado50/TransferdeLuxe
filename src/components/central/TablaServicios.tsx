import Link from "next/link";
import EstadoBadge from "@/components/comun/EstadoBadge";
import type { Servicio } from "@/lib/dominio/tipos";
import EnlaceVuelo from "@/components/vuelos/EnlaceVuelo";
import { agruparPorDia } from "@/lib/dominio/periodo";

export type FilaServicio = Servicio & { conductor: { nombre: string } | null };

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

export default function TablaServicios({ filas }: { filas: FilaServicio[] }) {
  if (!filas.length) return <p className="text-slate-400">No hay servicios con estos filtros.</p>;
  return (
    <div className="space-y-5">
      {agruparPorDia(filas).map((g) => (
        <section key={g.dia} aria-label={g.titulo}>
          <h2 className="mb-2 text-base font-semibold text-marca-claro">{g.titulo}</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>{["Hora", "Trayecto", "Pax / maletas", "Cliente", "Conductor", "Estado", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {g.servicios.map((s) => {
                  const inc = /^(rechazado|expirado)/.test(s.ultima_incidencia ?? "") && !s.incidencia_vista;
                  return (
                    <tr key={s.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                      <td className="whitespace-nowrap px-3 py-2">{hora.format(new Date(s.fecha_hora_recogida))}</td>
                      <td className="px-3 py-2">{s.origen_texto} → {s.destino_texto}{s.numero_vuelo && <><br /><EnlaceVuelo codigo={s.numero_vuelo} className="text-xs" /></>}</td>
                      <td className="px-3 py-2">{s.pasajeros} / {s.maletas}</td>
                      <td className="px-3 py-2">{s.cliente_nombre} {s.cliente_apellidos}</td>
                      <td className="px-3 py-2">{s.conductor?.nombre ?? "—"}</td>
                      <td className="px-3 py-2"><EstadoBadge estado={s.estado} />
                        {inc && <span title={s.ultima_incidencia ?? ""} aria-label="Incidencia" className="ml-2 text-red-500">●</span>}</td>
                      <td className="px-3 py-2"><Link href={`/central/servicios/${s.id}`} className="inline-flex min-h-11 items-center px-2 text-marca-claro hover:underline">Ver</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
