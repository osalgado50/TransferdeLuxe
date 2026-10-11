"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { resolverIncidencia } from "@/app/central/modulos-actions";
import { nombreTipoIncidencia } from "@/lib/dominio/incidencias";
import type { Movimiento } from "@/lib/dominio/actividad";

/**
 * Lo GRAVE (avería, accidente) fijado arriba del todo, en rojo, hasta que la central pulsa «Visto» (este navegador)
 * o «Marcar resuelta» (para todos). Con conductor, zona, hora, servicio, descripción, llamada y posición en el mapa.
 */
export default function AlertasGraves({ graves, alVisto, alCentrar }: {
  graves: Movimiento[]; alVisto: (id: string) => void; alCentrar: (p: { lat: number; lng: number }) => void;
}) {
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!graves.length) return null;
  const resolver = (g: Movimiento) => ini(async () => {
    setError(null);
    const r = await resolverIncidencia(g.incidenciaId!);
    if (!r.ok) setError(r.error);
  });
  return (
    <div className="space-y-3" role="alert" aria-live="assertive">
      {error && <p className="text-sm text-red-300">{error}</p>}
      {graves.map((g) => {
        const tipo = nombreTipoIncidencia(g.tipo.replace(/^incidencia_/, "")).toUpperCase();
        return (
          <article key={g.id} data-alerta="Grave" className="rounded-xl border-2 border-red-500 bg-red-950 p-4 shadow-lg shadow-red-900/50 ring-2 ring-red-500/40">
            <p className="flex items-center gap-2 text-xl font-bold text-red-100">
              <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-red-500" /></span>
              ⚠ {tipo} · {g.conductor ?? "Conductor"}
            </p>
            <p className="mt-1 text-base font-medium text-red-100">{g.zona ?? "Zona desconocida (sin GPS)"} · {g.hora}</p>
            {g.descripcion && <p className="mt-1 text-base text-white">{g.descripcion}</p>}
            {g.detalle && <p className="mt-1 text-sm text-red-200">Servicio: {g.detalle}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {g.telefono && <a href={`tel:${g.telefono}`} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">📞 Llamar a {g.conductor ?? "conductor"}</a>}
              {g.lat != null && g.lng != null && (
                <button type="button" onClick={() => alCentrar({ lat: g.lat!, lng: g.lng! })} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-100 hover:bg-red-900">📍 Ver en el mapa</button>
              )}
              {g.servicioId && <Link href={`/central/servicios/${g.servicioId}`} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-100 hover:bg-red-900">Ver servicio</Link>}
              <button type="button" onClick={() => alVisto(g.id)} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-100 hover:bg-red-900">Visto</button>
              {g.incidenciaId && <button type="button" disabled={pend} onClick={() => resolver(g)} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Marcar resuelta</button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
