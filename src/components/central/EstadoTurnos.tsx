"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { estadoTurno, textoTramos, tramosDelDia, type EstadoTurno, type HorarioConductor } from "@/lib/dominio/horarios";
import { diaMadrid } from "@/lib/dominio/geo";

const COLOR: Record<EstadoTurno["estado"], string> = {
  en_turno: "border-green-600/50 bg-green-900/30 text-green-200",
  pausa: "border-amber-600/50 bg-amber-900/30 text-amber-200",
  antes: "border-slate-700 bg-slate-900 text-slate-300",
  fuera: "border-slate-700 bg-slate-900 text-slate-400",
  libre: "border-slate-700 bg-slate-900 text-slate-500",
  sin_horario: "border-slate-700 bg-slate-900 text-slate-400",
};

/**
 * Estado de turno de cada conductor con horario (panel): «en turno hasta 15:00», «en pausa hasta 16:00», «fuera de turno».
 * Se recalcula cada minuto en el navegador. Sin ningún horario definido no se pinta nada.
 */
export default function EstadoTurnos({ horarios, conductores }: { horarios: Record<string, HorarioConductor>; conductores: { id: string; nombre: string }[] }) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => { setAhora(Date.now()); const t = setInterval(() => setAhora(Date.now()), 60_000); return () => clearInterval(t); }, []);
  if (ahora == null) return null;
  const hoy = diaMadrid(new Date(ahora));
  const filas = conductores.filter((c) => tramosDelDia(horarios[c.id], hoy).restringido);
  if (!filas.length) return null;
  return (
    <section aria-label="Turnos de hoy" className="flex flex-wrap items-center gap-2 text-sm">
      <Link href="/central/horarios" className="font-medium text-marca-claro hover:underline">Turnos de hoy:</Link>
      {filas.map((c) => {
        const e = estadoTurno(horarios[c.id], ahora);
        const d = tramosDelDia(horarios[c.id], hoy);
        return (
          <span key={c.id} data-turno={e.estado} title={d.restringido ? textoTramos(d.tramos) : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs ${COLOR[e.estado]}`}>
            <b>{c.nombre}</b> · {e.texto}
          </span>
        );
      })}
    </section>
  );
}
