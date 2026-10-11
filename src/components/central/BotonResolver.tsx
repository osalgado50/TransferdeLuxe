"use client";
import { useTransition } from "react";
import { resolverIncidencia, revisionVista } from "@/app/central/modulos-actions";

export function BotonResolver({ id, resuelta }: { id: string; resuelta: boolean }) {
  const [pend, ini] = useTransition();
  return (
    <button type="button" disabled={pend} onClick={() => ini(async () => { await resolverIncidencia(id, !resuelta); })}
      className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${resuelta ? "border border-slate-600" : "bg-marca text-white"}`}>
      {resuelta ? "Reabrir" : "Marcar resuelta"}
    </button>
  );
}

export function BotonRevisionVista({ id }: { id: string }) {
  const [pend, ini] = useTransition();
  return <button type="button" disabled={pend} onClick={() => ini(async () => { await revisionVista(id); })} className="rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-50">Visto</button>;
}
