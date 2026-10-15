"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anularTicket } from "@/app/central/combustible/actions";

/** «Anular» un ticket de combustible: pide confirmación y un motivo opcional. No borra nada. */
export default function BotonAnularTicket({ id, resumen }: { id: string; resumen: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  if (!abierto) return (
    <button type="button" onClick={() => { setAbierto(true); setError(null); }}
      className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800">Anular</button>
  );
  return (
    <div role="group" aria-label={`Anular el ticket ${resumen}`} className="mt-1 flex min-w-56 flex-col gap-1 rounded border border-red-800 bg-slate-950 p-2 text-xs">
      <p className="text-red-200">¿Anular el ticket {resumen}? Dejará de contar en gasto, consumo e informes (no se borra).</p>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (opcional)" aria-label="Motivo de la anulación"
        className="rounded border border-slate-600 bg-slate-900 px-2 py-1" />
      <div className="flex gap-2">
        <button type="button" disabled={pend} onClick={() => ini(async () => {
          const r = await anularTicket(id, motivo);
          if (!r.ok) { setError(r.error); return; }
          setAbierto(false);
          router.refresh();
        })} className="rounded bg-red-700 px-2 py-1 font-medium text-white hover:bg-red-600 disabled:opacity-50">{pend ? "Anulando…" : "Sí, anular"}</button>
        <button type="button" disabled={pend} onClick={() => setAbierto(false)} className="rounded border border-slate-600 px-2 py-1">Cancelar</button>
      </div>
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
  );
}
