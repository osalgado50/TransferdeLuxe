"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EstadoBadge from "@/components/comun/EstadoBadge";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import type { EstadoServicio } from "@/lib/dominio/tipos";

export type ServicioHoy = { id: string; estado: EstadoServicio; conductor_id: string | null; fecha_hora_recogida: string; origen_texto: string; destino_texto: string; pasajeros: number; maletas: number };
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

export default function ListaHoy({ iniciales, yo, desde, hasta }: { iniciales: ServicioHoy[]; yo: string; desde: string; hasta: string }) {
  const router = useRouter();
  // A medianoche (Madrid) el día cambia: recargar la lista.
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), Math.max(1000, Date.parse(hasta) - Date.now() + 1000));
    return () => clearTimeout(t);
  }, [hasta, router]);
  const todos = useTiempoReal("servicios", iniciales, "id");
  const mios = todos
    .filter((s) => s.conductor_id === yo && s.estado !== "cancelado" && s.fecha_hora_recogida >= desde && s.fecha_hora_recogida < hasta)
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
  if (mios.length === 0) return <p className="py-10 text-center text-slate-400">No tienes servicios para hoy.</p>;
  const siguiente = mios.find((s) => s.estado !== "completado")?.id;
  return (
    <ul className="space-y-3">
      {mios.map((s) => {
        const destacada = s.id === siguiente;
        return (
          <li key={s.id} className={`rounded-xl border p-4 ${destacada ? "border-amber-400 bg-slate-900" : "border-slate-700 bg-slate-900/60"} ${s.estado === "completado" ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-3xl font-bold">{hora.format(new Date(s.fecha_hora_recogida))}</span>
              <EstadoBadge estado={s.estado} />
            </div>
            <p className="mt-2 text-base">{s.origen_texto} → {s.destino_texto}</p>
            <p className="text-sm text-slate-400">{s.pasajeros} pax · {s.maletas} maletas</p>
            {destacada && (
              <Link href={`/conductor/servicio/${s.id}`} className="mt-3 flex min-h-14 items-center justify-center rounded-xl bg-amber-400 text-lg font-semibold text-slate-950">Abrir</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
