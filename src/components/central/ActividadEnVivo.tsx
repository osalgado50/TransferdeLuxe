"use client";
import Link from "next/link";
import type { Movimiento } from "@/lib/dominio/actividad";

const ESTILO = {
  grave: "border-red-600 bg-red-950/70 text-red-100 font-semibold",
  aviso: "border-amber-600/70 bg-slate-900 text-amber-200",
  info: "border-slate-800 bg-slate-900 text-slate-200",
} as const;

/** Todos los movimientos de las últimas 12 h (aceptado, en camino, recogido, completado, incidencias…), lo nuevo arriba. */
export default function ActividadEnVivo({ movimientos }: { movimientos: Movimiento[] }) {
  return (
    <section aria-label="Actividad en vivo" className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-green-500" /></span>
        Actividad en vivo
      </h2>
      {movimientos.length === 0
        ? <p className="text-sm text-slate-400">Sin movimientos en las últimas 12 h.</p>
        : (
          <ol className="space-y-1.5" aria-live="polite" aria-relevant="additions">
            {movimientos.map((m) => (
              <li key={m.id} data-movimiento={m.tipo} data-gravedad={m.gravedad} className={`flex gap-2 rounded-lg border p-2 text-sm ${ESTILO[m.gravedad]}`}>
                <span aria-hidden="true" className="shrink-0">{m.icono}</span>
                <div className="min-w-0 flex-1">
                  <p><time dateTime={m.en} className="mr-1.5 font-mono text-xs font-normal text-slate-400">{m.hora}</time>{m.texto}</p>
                  {m.detalle && (
                    <p className="truncate text-xs font-normal text-slate-400">
                      {m.servicioId ? <Link href={`/central/servicios/${m.servicioId}`} className="hover:underline">{m.detalle}</Link> : m.detalle}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
