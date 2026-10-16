"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { colaDe, drenar } from "@/lib/offline/colaConductor";
import { accionDevolver, MOTIVOS_DEVOLUCION } from "@/lib/dominio/estados";

/**
 * La ✕ de cada servicio y «Devolver todos a la central»: cuando se acumulan trabajos o la app se queda enganchada, el
 * conductor se los quita de encima y la central los redistribuye. Asignados → rechazar; aceptados o de camino →
 * devolver (con el cliente a bordo, no). Por la cola offline (idempotente, funciona sin cobertura).
 */
type Devolvible = { id: string; estado: string };

// Devueltos en esta página: las listas los quitan al momento (al dejar de ser suyos, Realtime ya no avisa por RLS).
let devueltos = new Set<string>();
const oyentes = new Set<() => void>();
const marcar = (ids: string[]) => { devueltos = new Set([...devueltos, ...ids]); oyentes.forEach((f) => f()); };
const VACIO = new Set<string>();
export function useDevueltos(): ReadonlySet<string> {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => devueltos, () => VACIO);
}

export default function DevolverRapido({ conductorId, servicios, enBloque, etiqueta }: {
  conductorId: string; servicios: Devolvible[]; enBloque?: boolean; etiqueta?: string;
}) {
  const router = useRouter();
  const ya = useDevueltos();
  const [abierto, setAbierto] = useState(false);
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState("");
  const validos = servicios.filter((s) => accionDevolver(s.estado) && !ya.has(s.id));
  if (validos.length === 0 || (enBloque && validos.length < 2)) return null;

  const devolver = (motivo: string) => {
    const m = motivo.trim();
    const que = enBloque ? `los ${validos.length} servicios` : "el servicio";
    if (!m || !confirm(`¿Devolver ${que} a la central?\nMotivo: ${m}\n\nLa central los asignará a otro conductor.`)) return;
    const { cola, rechazos } = colaDe(conductorId);
    const pendientes = new Set(cola.pendientes().map((p) => p.servicioId));
    for (const s of validos) {
      const accion = accionDevolver(s.estado);
      if (!accion || pendientes.has(s.id)) continue;
      rechazos.delete(s.id);
      cola.encolar({ idAccion: crypto.randomUUID(), servicioId: s.id, accion, motivo: m });
    }
    marcar(validos.map((s) => s.id));
    setAbierto(false); setOtro(false); setTexto("");
    void drenar(conductorId, true).catch(() => {}).finally(() => router.refresh());
  };

  return (
    <>
      {enBloque
        ? <button type="button" onClick={() => setAbierto(true)} className="min-h-14 w-full rounded-xl border-2 border-red-500 text-base font-semibold text-red-300">
            ↩ Devolver todos a la central ({validos.length})
          </button>
        : <button type="button" onClick={() => setAbierto(true)} aria-label={etiqueta ?? "Devolver este servicio a la central"} title="Devolver a la central"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border-2 border-red-500/80 text-xl font-bold text-red-300 hover:bg-red-500/20">✕</button>}
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="Devolver a la central" className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:rounded-2xl">
            <h2 className="text-lg font-semibold text-red-300">{enBloque ? `Devolver ${validos.length} servicios` : "Devolver a la central"}</h2>
            <p className="text-sm text-slate-400">Elige el motivo. Vuelve{enBloque ? "n" : ""} a la central para que los reparta entre otros conductores.</p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_DEVOLUCION.map((m) => (
                <button key={m} type="button" onClick={() => (m === "Otro" ? setOtro(true) : devolver(m))}
                  className="min-h-14 rounded-xl border border-slate-600 px-2 text-base font-semibold">{m}</button>
              ))}
            </div>
            {otro && (
              <div className="flex gap-2">
                <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Escribe el motivo" aria-label="Motivo"
                  className="min-h-12 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3" />
                <button type="button" disabled={!texto.trim()} onClick={() => devolver(texto)} className="rounded-lg bg-red-600 px-4 font-semibold text-white disabled:opacity-40">Devolver</button>
              </div>
            )}
            <button type="button" onClick={() => { setAbierto(false); setOtro(false); }} className="min-h-12 w-full rounded-xl border border-slate-600">Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}
