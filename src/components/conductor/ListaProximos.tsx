"use client";
import Link from "next/link";
import EstadoBadge from "@/components/comun/EstadoBadge";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import type { ServicioHoy } from "./ListaHoy";

const fechaHora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ListaProximos({ iniciales, yo, desde, hasta }: { iniciales: ServicioHoy[]; yo: string; desde: string; hasta: string }) {
  const todos = useTiempoReal("servicios", iniciales, "id");
  const mios = todos
    .filter((s) => s.conductor_id === yo && s.estado !== "cancelado" && s.estado !== "completado" && s.fecha_hora_recogida >= desde && s.fecha_hora_recogida < hasta)
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
  if (mios.length === 0) return <p className="py-6 text-center text-slate-400">No tienes servicios en los próximos 7 días.</p>;
  return (
    <ul className="space-y-3">
      {mios.map((s) => (
        <li key={s.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-bold">{fechaHora.format(new Date(s.fecha_hora_recogida))}</span>
            <EstadoBadge estado={s.estado} />
          </div>
          <p className="mt-2 text-base">{s.origen_texto} → {s.destino_texto}</p>
          <p className="text-sm text-slate-400">{s.pasajeros} pax · {s.maletas} maletas</p>
          <Link href={`/conductor/servicio/${s.id}`} className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-marca text-lg font-semibold text-white">Abrir</Link>
        </li>
      ))}
    </ul>
  );
}
