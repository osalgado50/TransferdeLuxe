"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { diaMadrid } from "@/lib/dominio/geo";
import { direccionCorta } from "@/lib/dominio/direccion";
import type { GrupoCentral } from "@/lib/dominio/centralMovil";
import type { EstadoServicio, Servicio } from "@/lib/dominio/tipos";

const ITEMS: { titulo: string; grupo: GrupoCentral; estados: EstadoServicio[] }[] = [
  { titulo: "Pendientes", grupo: "sin_asignar", estados: ["pendiente"] },
  { titulo: "Esperando respuesta", grupo: "esperando", estados: ["asignado"] },
  { titulo: "En curso", grupo: "en_curso", estados: ["aceptado", "en_camino", "recogido"] },
  { titulo: "Completados", grupo: "terminados", estados: ["completado"] },
];
const ETIQUETA: Partial<Record<EstadoServicio, string>> = {
  pendiente: "Pendiente", asignado: "Esperando respuesta", aceptado: "Aceptado", en_camino: "En camino", recogido: "Con pasajeros", completado: "Completado",
};
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const corta = (t: string) => { const d = direccionCorta(t); return d.localidad ? `${d.principal} · ${d.localidad}` : d.principal; };

/** Contadores del día; al pulsar uno se abre una ventana con esos servicios para ir directamente a cada ficha. */
export default function Contadores({ servicios, conductores = [] }: { servicios: Servicio[]; conductores?: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState<(typeof ITEMS)[number] | null>(null);
  const hoy = diaMadrid(new Date());
  const delDia = servicios.filter((s) => diaMadrid(s.fecha_hora_recogida) === hoy);
  const de = (it: (typeof ITEMS)[number]) => delDia.filter((s) => it.estados.includes(s.estado as EstadoServicio))
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
  const nombre = (id: string | null) => conductores.find((c) => c.id === id)?.nombre ?? null;
  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(null); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [abierto]);
  const lista = abierto ? de(abierto) : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ITEMS.map((it) => (
          <button key={it.titulo} type="button" data-contador={it.titulo} onClick={() => setAbierto(it)}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-marca-claro hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-marca-claro">
            <p className="text-3xl font-semibold text-marca-claro">{de(it).length}</p>
            <p className="text-sm text-slate-400">{it.titulo} <span aria-hidden className="text-slate-500">›</span></p>
          </button>
        ))}
      </div>
      {abierto && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => setAbierto(null)}>
          <div role="dialog" aria-modal="true" aria-label={`${abierto.titulo} de hoy`} onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-marca-claro">{abierto.titulo} de hoy ({lista.length})</h2>
              <button type="button" onClick={() => setAbierto(null)} className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm hover:border-marca-claro">Cerrar</button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-slate-800 overflow-y-auto">
              {lista.length === 0 && <li className="p-4 text-sm text-slate-400">No hay servicios en este estado hoy.</li>}
              {lista.map((s) => (
                <li key={s.id}>
                  <Link href={`/central/servicios/${s.id}`} className="flex items-start gap-3 p-4 hover:bg-slate-800">
                    <span className="w-14 shrink-0 text-lg font-semibold tabular-nums">{hora.format(new Date(s.fecha_hora_recogida))}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.cliente_nombre} · {s.pasajeros} pax</span>
                      <span className="block truncate text-sm text-red-300">↑ {corta(s.origen_texto)}</span>
                      <span className="block truncate text-sm text-green-300">↓ {corta(s.destino_texto)}</span>
                      <span className="block text-xs text-slate-400">{ETIQUETA[s.estado as EstadoServicio] ?? s.estado}{nombre(s.conductor_id) ? ` · ${nombre(s.conductor_id)}` : ""}</span>
                    </span>
                    <span aria-hidden className="self-center text-slate-500">›</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-800 p-3 text-right">
              <Link href={`/central/servicios?grupo=${abierto.grupo}`} className="text-sm text-marca-claro underline">Ver en Servicios</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
