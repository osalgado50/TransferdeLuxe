"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { diaMadrid } from "@/lib/dominio/geo";
import { direccionCorta } from "@/lib/dominio/direccion";
import type { GrupoCentral } from "@/lib/dominio/centralMovil";
import type { EstadoServicio, PosicionActual, Servicio } from "@/lib/dominio/tipos";
import { indicadoresPuntualidad, resumenIndicadores } from "@/lib/dominio/puntualidadCentral";
import ChipPuntualidad from "./ChipPuntualidad";

type Item = { titulo: string; grupo: GrupoCentral; estados: EstadoServicio[]; atrasados?: boolean };
/** Servicios de días anteriores que siguen sin terminar (sin asignar, sin respuesta o sin cerrar). */
const ESTADOS_ATRASADOS: EstadoServicio[] = ["pendiente", "asignado", "aceptado", "en_camino", "recogido"];
const SIN_ATRASADOS: Servicio[] = [];
const ATRASADOS: Item = { titulo: "Atrasados", grupo: "sin_asignar", estados: ESTADOS_ATRASADOS, atrasados: true };
const ITEMS: Item[] = [
  { titulo: "Pendientes", grupo: "sin_asignar", estados: ["pendiente"] },
  { titulo: "Esperando respuesta", grupo: "esperando", estados: ["asignado"] },
  { titulo: "En curso", grupo: "en_curso", estados: ["aceptado", "en_camino", "recogido"] },
  { titulo: "Completados", grupo: "terminados", estados: ["completado"] },
];
const ETIQUETA: Partial<Record<EstadoServicio, string>> = {
  pendiente: "Pendiente", asignado: "Esperando respuesta", aceptado: "Aceptado", en_camino: "En camino", recogido: "Con pasajeros", completado: "Completado",
};
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const diaCorto = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
const corta = (t: string) => { const d = direccionCorta(t); return d.localidad ? `${d.principal} · ${d.localidad}` : d.principal; };

/** Contadores del día; al pulsar uno se abre una ventana con esos servicios para ir directamente a cada ficha. */
export default function Contadores({ servicios, conductores = [], posiciones = [], umbralMin = 5, atrasados = SIN_ATRASADOS }: {
  servicios: Servicio[]; conductores?: { id: string; nombre: string }[]; posiciones?: PosicionActual[]; umbralMin?: number;
  /** Servicios de días anteriores aún sin terminar, leídos al cargar (los cambios en vivo llegan por `servicios`). */
  atrasados?: Servicio[];
}) {
  const [abierto, setAbierto] = useState<Item | null>(null);
  // Semáforo de puntualidad (verde/naranja/rojo): se recalcula con cada cambio en tiempo real y cada 30 s.
  const [tic, setTic] = useState(0);
  useEffect(() => { const t = setInterval(() => setTic((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const punt = useMemo(() => indicadoresPuntualidad({
    servicios: servicios.filter((s) => Date.parse(s.fecha_hora_recogida) > Date.now() - 12 * 3600e3), posiciones, ahora: Date.now(), umbralGpsMin: umbralMin,
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [servicios, posiciones, umbralMin, tic]);
  const hoy = diaMadrid(new Date());
  const delDia = servicios.filter((s) => diaMadrid(s.fecha_hora_recogida) === hoy);
  // Atrasados: los de días anteriores sin terminar (la versión en vivo de cada uno, si ha cambiado, manda).
  const deAntes = useMemo(() => {
    const m = new Map(atrasados.map((s) => [s.id, s]));
    for (const s of servicios) if (m.has(s.id) || diaMadrid(s.fecha_hora_recogida) < hoy) m.set(s.id, s);
    return [...m.values()].filter((s) => diaMadrid(s.fecha_hora_recogida) < hoy && !(s as Servicio & { es_prueba?: boolean }).es_prueba);
  }, [atrasados, servicios, hoy]);
  const de = (it: Item) => (it.atrasados ? deAntes : delDia).filter((s) => it.estados.includes(s.estado as EstadoServicio))
    .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
  const nAtrasados = de(ATRASADOS).length;
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
      {nAtrasados > 0 && (
        <button type="button" data-contador="Atrasados" onClick={() => setAbierto(ATRASADOS)}
          className="mb-3 flex w-full items-center gap-3 rounded-xl border border-amber-600 bg-amber-950/50 px-4 py-2 text-left text-sm text-amber-100 hover:bg-amber-900/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
          <span className="text-2xl font-semibold">{nAtrasados}</span>
          <span className="flex-1">{nAtrasados === 1 ? "servicio atrasado" : "servicios atrasados"} de días anteriores sin terminar (sin asignar, sin respuesta o sin cerrar)</span>
          <span aria-hidden className="text-amber-300">›</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ITEMS.map((it) => (
          <button key={it.titulo} type="button" data-contador={it.titulo} onClick={() => setAbierto(it)}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-marca-claro hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-marca-claro">
            <p className="text-3xl font-semibold text-marca-claro">{de(it).length}</p>
            <p className="text-sm text-slate-400">{it.titulo} <span aria-hidden className="text-slate-500">›</span></p>
            {(() => {
              const r = resumenIndicadores(de(it).map((s) => punt[s.id]));
              return (r.tarde > 0 || r.justo > 0) && (
                <p className="mt-1 flex flex-wrap gap-1 text-xs font-semibold" data-desglose={it.titulo}>
                  {r.tarde > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">{r.tarde} {r.tarde === 1 ? "va" : "van"} tarde</span>}
                  {r.justo > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-slate-950">{r.justo} justo{r.justo === 1 ? "" : "s"}</span>}
                </p>
              );
            })()}
          </button>
        ))}
      </div>
      {abierto && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => setAbierto(null)}>
          <div role="dialog" aria-modal="true" aria-label={abierto.atrasados ? "Atrasados de días anteriores" : `${abierto.titulo} de hoy`} onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-marca-claro">{abierto.atrasados ? "Atrasados de días anteriores" : `${abierto.titulo} de hoy`} ({lista.length})</h2>
              <button type="button" onClick={() => setAbierto(null)} className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm hover:border-marca-claro">Cerrar</button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-slate-800 overflow-y-auto">
              {lista.length === 0 && <li className="p-4 text-sm text-slate-400">{abierto.atrasados ? "No queda ningún servicio atrasado." : "No hay servicios en este estado hoy."}</li>}
              {lista.map((s) => (
                <li key={s.id}>
                  <Link href={`/central/servicios/${s.id}`} className="flex items-start gap-3 p-4 hover:bg-slate-800">
                    <span className="w-14 shrink-0 text-lg font-semibold tabular-nums">{hora.format(new Date(s.fecha_hora_recogida))}
                      {abierto.atrasados && <span className="block text-xs font-normal text-amber-300">{diaCorto.format(new Date(s.fecha_hora_recogida))}</span>}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.cliente_nombre} · {s.pasajeros} pax</span>
                      <span className="block truncate text-sm text-red-300">↑ {corta(s.origen_texto)}</span>
                      <span className="block truncate text-sm text-green-300">↓ {corta(s.destino_texto)}</span>
                      <span className="block text-xs text-slate-400">{ETIQUETA[s.estado as EstadoServicio] ?? s.estado}{nombre(s.conductor_id) ? ` · ${nombre(s.conductor_id)}` : ""}</span>
                      <ChipPuntualidad ind={punt[s.id]} className="mt-1 flex" />
                    </span>
                    <span aria-hidden className="self-center text-slate-500">›</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-800 p-3 text-right">
              <Link href={abierto.atrasados && lista[0] ? `/central/servicios?vista=mes&desde=${diaMadrid(lista[0].fecha_hora_recogida)}` : `/central/servicios?grupo=${abierto.grupo}`}
                className="text-sm text-marca-claro underline">Ver en Servicios</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
