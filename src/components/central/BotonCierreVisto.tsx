"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cierreVisto } from "@/app/central/modulos-actions";

/** «Visto» de una hoja de cierre (para toda la central). */
export default function BotonCierreVisto({ id }: { id: string }) {
  const router = useRouter();
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={pend} onClick={() => ini(async () => {
        const r = await cierreVisto(id);
        if (!r.ok) { setError(r.error); return; }
        router.refresh();
      })} className="rounded border border-slate-500 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-50">{pend ? "…" : "Marcar visto"}</button>
      {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
