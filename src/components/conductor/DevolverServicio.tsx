"use client";
import { useState } from "react";
import Link from "next/link";
import { colaDe, drenar } from "@/lib/offline/colaConductor";
import { MOTIVOS_DEVOLUCION } from "@/lib/dominio/estados";
import AvisoCliente from "@/components/comun/AvisoCliente";

/**
 * «No puedo hacer este servicio» (avería, retraso grave, emergencia…): lo devuelve a la central con motivo, por la
 * cola offline (idempotente). Después ofrece avisar al cliente del cambio de conductor (WhatsApp/SMS).
 */
export default function DevolverServicio({ servicioId, conductorId, estado, telefono, cliente, recogida, conductorNombre }: {
  servicioId: string; conductorId: string; estado: string; telefono: string | null; cliente: string | null; recogida: string; conductorNombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState("");
  const [hecho, setHecho] = useState(false);
  if (!hecho && estado !== "aceptado" && estado !== "en_camino") return null;

  const devolver = (motivo: string) => {
    if (!motivo.trim() || !confirm(`¿Devolver el servicio a la central?\nMotivo: ${motivo}\n\nLa central asignará otro conductor.`)) return;
    const { cola, rechazos } = colaDe(conductorId);
    rechazos.delete(servicioId);
    cola.encolar({ idAccion: crypto.randomUUID(), servicioId, accion: "devolver", motivo: motivo.trim() });
    setAbierto(false);
    setHecho(true);
    void drenar(conductorId, true).catch(() => {});
  };

  if (hecho) return <ServicioDevueltoPanel servicioId={servicioId} estado={estado} telefono={telefono} cliente={cliente} recogida={recogida} conductorNombre={conductorNombre} />;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} data-accion="devolver"
        className="min-h-14 w-full rounded-xl border-2 border-red-500 text-base font-semibold text-red-300">🙅 No puedo hacer este servicio</button>
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="No puedo hacer este servicio" className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:rounded-2xl">
            <h2 className="text-lg font-semibold text-red-300">¿Por qué no puedes hacerlo?</h2>
            <p className="text-sm text-slate-400">El servicio vuelve a la central para que asigne otro conductor.</p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_DEVOLUCION.map((m) => (
                <button key={m} type="button" onClick={() => (m === "Otro" ? setOtro(true) : devolver(m))}
                  className="min-h-14 rounded-xl border border-slate-600 text-base font-semibold">{m}</button>
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

/** Tras devolver (también al recargar la página): aviso del cambio de conductor al cliente. */
export function ServicioDevueltoPanel({ servicioId, estado, telefono, cliente, recogida, conductorNombre }: {
  servicioId: string; estado: string; telefono: string | null; cliente: string | null; recogida: string; conductorNombre: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
      <p className="text-lg font-semibold text-amber-200">🔁 Servicio devuelto a la central</p>
      <p className="text-sm text-slate-300">La central asignará otro conductor. Avisa al cliente del cambio:</p>
      <AvisoCliente servicioId={servicioId} estado={estado} recogida={recogida} telefono={telefono} cliente={cliente} tipos={["reasignacion"]}
        modo="conductor" conductorNombre={conductorNombre} etiqueta="💬 Avisar al cliente del cambio" />
      <Link href="/conductor" className="flex min-h-12 items-center justify-center rounded-xl border border-slate-600 font-semibold">Volver a Hoy</Link>
    </div>
  );
}
