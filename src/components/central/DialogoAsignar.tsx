"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { accionCentral, obtenerSugerencias } from "@/app/central/actions";
import { preguntaAsignarAusente } from "@/lib/dominio/ausencias";

type Sug = Awaited<ReturnType<typeof obtenerSugerencias>>[number];

export default function DialogoAsignar({ servicioId, reasignar = false, onHecho }: { servicioId: string; reasignar?: boolean; onHecho?: () => void }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Sug[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const etiqueta = reasignar ? "Reasignar" : "Asignar";

  const abrir = () => {
    setAbierto(true); setLista(null); setError(null); setConfirmando(null);
    obtenerSugerencias(servicioId).then(setLista).catch(() => { setLista([]); setError("No se pudieron cargar las sugerencias"); });
  };
  const asignar = (s: Sug) => {
    setError(null);
    ini(async () => {
      const r = await accionCentral({ idAccion: crypto.randomUUID(), servicioId, accion: reasignar ? "reasignar" : "asignar", conductorId: s.conductorId, vehiculoId: s.vehiculoId ?? undefined });
      if (!r.ok) { setError(r.error ?? "No se pudo completar la acción"); return; }
      setAbierto(false); onHecho?.(); router.refresh();
    });
  };
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [abierto]);
  const primeraApta = lista?.findIndex((s) => s.apto) ?? -1;

  return (
    <>
      <button type="button" data-accion="asignar" onClick={abrir} className="rounded-lg border border-marca-claro px-4 py-2 text-sm text-marca-claro">{etiqueta}</button>
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label={`${etiqueta} conductor`} onClick={() => setAbierto(false)} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{etiqueta} conductor</h2>
              <button type="button" onClick={() => setAbierto(false)} className="text-sm text-neutral-400">Cerrar</button>
            </div>
            {lista === null && <p className="text-sm text-neutral-400">Calculando sugerencias…</p>}
            {lista?.length === 0 && !error && <p className="text-sm text-neutral-400">No hay conductores disponibles.</p>}
            <ul className="space-y-3">
              {lista?.map((s, i) => (
                <li key={s.conductorId} data-testid={"tarjeta-conductor-" + s.nombre} className="rounded-lg border border-neutral-700 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{s.nombre}</p>
                      <p className="text-xs text-neutral-400">{s.matricula ?? "Sin vehículo"}</p>
                      {/* Conexión: verde = GPS activo y reciente; rojo = sin señal; gris = fuera de servicio. */}
                      <p data-conexion={s.conexion.estado} className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.conexion.estado === "en_linea" ? "bg-green-900/60 text-green-300" : s.conexion.estado === "sin_senal" ? "bg-red-900/60 text-red-300" : "bg-slate-800 text-slate-400"}`}>
                        <span className={`size-2.5 rounded-full ${s.conexion.estado === "en_linea" ? "animate-pulse bg-green-400" : s.conexion.estado === "sin_senal" ? "bg-red-500" : "bg-slate-500"}`} />
                        {s.conexion.texto}
                      </p>
                    </div>
                    {i === primeraApta && <span className="rounded bg-green-600 px-2 py-0.5 text-xs text-white">Recomendado</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.motivos.map((m) => (
                      <span key={m} className={`rounded-full px-2 py-0.5 text-xs ${s.apto ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}`}>{m}</span>
                    ))}
                  </div>
                  <div className="mt-3">
                    {s.apto ? (
                      <button type="button" disabled={pend} onClick={() => asignar(s)} className="rounded-lg bg-marca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Asignar a {s.nombre}</button>
                    ) : confirmando === s.conductorId ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-300">{s.ausencia ? preguntaAsignarAusente(s.ausencia) : "No es apto. ¿Asignar igualmente?"}</span>
                        <button type="button" disabled={pend} onClick={() => asignar(s)} className="rounded-lg bg-red-600 px-3 py-1.5 text-white disabled:opacity-50">Asignar igualmente: confirmar</button>
                        <button type="button" onClick={() => setConfirmando(null)} className="text-neutral-400">No</button>
                      </div>
                    ) : (
                      <button type="button" disabled={pend} onClick={() => setConfirmando(s.conductorId)} className="rounded-lg border border-red-500 px-3 py-1.5 text-sm text-red-300">Asignar igualmente</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
