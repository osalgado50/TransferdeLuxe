"use client";
import Link from "next/link";
import type { Movimiento } from "@/lib/dominio/actividad";

/**
 * Avisos que piden atención (sin ser graves): CARGA/DESCARGA marcada lejos del punto y jornada cerrada con servicios
 * pendientes hoy. Tarjeta ámbar con «Ver en el mapa» (centra el mapa en la posición del conductor), «Llamar» y «Visto»
 * (este navegador). Suenan con tres pitidos al llegar.
 */
export default function AvisosAtencion({ avisos, alVisto, alCentrar }: {
  avisos: Movimiento[]; alVisto: (id: string) => void; alCentrar: (p: { lat: number; lng: number }) => void;
}) {
  if (!avisos.length) return null;
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {avisos.map((a) => (
        <article key={a.id} data-alerta={a.tipo} className="rounded-xl border-2 border-amber-500 bg-amber-950/60 p-3">
          <p className="text-base font-semibold text-amber-100">{a.texto}</p>
          <p className="mt-0.5 text-xs text-amber-200/80">{a.hora}{a.detalle ? ` · ${a.detalle}` : ""}{a.tipo === "jornada_pendientes" ? " · reasigna esos servicios o llama al conductor" : " · quizá hay que llamarlo"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {a.lat != null && a.lng != null && (
              <button type="button" onClick={() => alCentrar({ lat: a.lat!, lng: a.lng! })} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900">📍 Ver en el mapa</button>
            )}
            {a.telefono && <a href={`tel:${a.telefono}`} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500">📞 Llamar a {a.conductor ?? "conductor"}</a>}
            {a.servicioId && <Link href={`/central/servicios/${a.servicioId}`} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900">Ver servicio</Link>}
            <button type="button" onClick={() => alVisto(a.id)} className="rounded-lg border border-slate-500 px-3 py-1.5 text-sm text-slate-200">Visto</button>
          </div>
        </article>
      ))}
    </div>
  );
}
