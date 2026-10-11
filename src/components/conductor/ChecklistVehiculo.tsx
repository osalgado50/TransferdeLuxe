"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checklistConductor } from "@/app/conductor/modulos-actions";
import type { ItemChecklist, RespuestaItem } from "@/lib/dominio/checklist";

/** Checklist del vehículo, una vez por día y vehículo. */
export default function ChecklistVehiculo({ items, vehiculos, vehiculoInicial }: {
  items: ItemChecklist[]; vehiculos: { id: string; matricula: string; modelo: string }[]; vehiculoInicial: string | null;
}) {
  const router = useRouter();
  const [vehiculo, setVehiculo] = useState(vehiculoInicial ?? "");
  const [resp, setResp] = useState<Record<string, RespuestaItem>>({});
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const completo = items.every((i) => resp[i.id]);

  const enviar = () => ini(async () => {
    setError(null);
    const r = await checklistConductor({ vehiculo_id: vehiculo, respuestas: resp, observaciones: obs });
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  });

  return (
    <section aria-label="Checklist del vehículo" className="space-y-3 rounded-xl border border-amber-500 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold text-amber-300">Checklist del vehículo (hoy)</h2>
      <label className="block text-sm">Vehículo
        <select value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-2">
          <option value="">Elige…</option>
          {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}</option>)}
        </select>
      </label>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2">
            <span>{i.texto}</span>
            <span className="flex gap-2">
              {(["ok", "mal"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={resp[i.id] === v} aria-label={`${i.texto}: ${v === "ok" ? "bien" : "mal"}`}
                  onClick={() => setResp((r) => ({ ...r, [i.id]: v }))}
                  className={`min-h-11 min-w-16 rounded-lg border px-3 text-sm font-semibold ${resp[i.id] === v ? (v === "ok" ? "border-green-500 bg-green-500/20 text-green-300" : "border-red-500 bg-red-500/20 text-red-300") : "border-slate-600"}`}>
                  {v === "ok" ? "Bien" : "Mal"}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <label className="block text-sm">Observaciones
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="button" disabled={pend || !completo || !vehiculo} onClick={enviar} className="min-h-12 w-full rounded-lg bg-marca font-semibold text-white disabled:opacity-50">{pend ? "Guardando…" : "Guardar checklist"}</button>
    </section>
  );
}
