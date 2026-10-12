"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cierreVisto, resolverIncidencia } from "@/app/central/modulos-actions";
import DiagramaVehiculo from "@/components/comun/DiagramaVehiculo";
import { nombreTipoIncidencia } from "@/lib/dominio/incidencias";
import { etiquetaZona } from "@/lib/dominio/cierre";
import type { Movimiento } from "@/lib/dominio/actividad";

/**
 * Lo GRAVE (avería, accidente, golpe) fijado arriba del todo, en rojo, hasta que la central pulsa «Visto» (este navegador)
 * o «Marcar resuelta» (para todos). Con conductor, zona, hora, servicio, descripción, llamada y posición en el mapa.
 */
export default function AlertasGraves({ graves, alVisto, alCentrar }: {
  graves: Movimiento[]; alVisto: (id: string) => void; alCentrar: (p: { lat: number; lng: number }) => void;
}) {
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!graves.length) return null;
  // Hoja de cierre: «Visto» es para toda la central (BD); el resto de graves, por navegador.
  const visto = (g: Movimiento) => {
    alVisto(g.id);
    if (g.cierreId) ini(async () => { const r = await cierreVisto(g.cierreId!); if (!r.ok) setError(r.error); });
  };
  const resolver = (g: Movimiento) => ini(async () => {
    setError(null);
    const r = await resolverIncidencia(g.incidenciaId!);
    if (!r.ok) setError(r.error);
  });
  return (
    <div className="space-y-3" role="alert" aria-live="assertive">
      {error && <p className="text-sm text-red-300">{error}</p>}
      {graves.map((g) => {
        if (g.cierreId) {
          const problemas = g.texto.replace(/ · «.*»$/, "").replace(/^🔴 /, "").split(" · ").filter((p) => p !== g.matricula && p !== g.conductor).join(" · ");
          return (
            <article key={g.id} data-alerta="Cierre" className="rounded-xl border-2 border-red-500 bg-red-950 p-4 shadow-lg shadow-red-900/50 ring-2 ring-red-500/40">
              <p className="flex items-center gap-2 text-lg font-bold text-red-100">
                <span className="relative flex size-3 shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-red-500" /></span>
                <span>HOJA DE CIERRE · {g.conductor ?? "Conductor"}{g.matricula ? ` · ${g.matricula}` : ""}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {!!g.zonasDanadas?.length && <div className="w-20 shrink-0"><DiagramaVehiculo zonas={g.zonasDanadas} mini /></div>}
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <p className="text-base font-medium text-white">{problemas}</p>
                  {g.descripcion && <p className="text-base text-red-100">«{g.descripcion}»</p>}
                  <p className="text-sm text-red-200">{g.hora} · revisar el vehículo antes de su próximo servicio</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {g.telefono && <a href={`tel:${g.telefono}`} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">📞 Llamar a {g.conductor ?? "conductor"}</a>}
                <Link href="/central/mantenimiento" className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-100 hover:bg-red-900">Mantenimiento</Link>
                <button type="button" disabled={pend} onClick={() => visto(g)} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Visto</button>
              </div>
            </article>
          );
        }
        const tipo = nombreTipoIncidencia(g.tipo.replace(/^incidencia_/, "")).toUpperCase();
        return (
          <article key={g.id} data-alerta="Grave" className="rounded-xl border-2 border-red-500 bg-red-950 p-4 shadow-lg shadow-red-900/50 ring-2 ring-red-500/40">
            <p className="flex items-center gap-2 text-xl font-bold text-red-100">
              <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-red-500" /></span>
              ⚠ {tipo} · {g.conductor ?? "Conductor"}
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              {/* Parte de golpes (accidente / golpe): mini-diagrama con las zonas, igual que en la hoja de cierre. */}
              {!!g.zonasDanadas?.length && <div className="w-20 shrink-0"><DiagramaVehiculo zonas={g.zonasDanadas} mini /></div>}
              <div className="min-w-[10rem] flex-1">
                <p className="text-base font-medium text-red-100">{g.zona ?? "Zona desconocida (sin GPS)"} · {g.hora}</p>
                {!!g.zonasDanadas?.length && <p className="mt-1 text-base font-medium text-white">Daños: {g.zonasDanadas.map(etiquetaZona).join(", ")}</p>}
                {g.descripcion && <p className="mt-1 text-base text-white">{g.descripcion}</p>}
                {g.detalle && <p className="mt-1 text-sm text-red-200">Servicio: {g.detalle}</p>}
              </div>
            </div>
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
