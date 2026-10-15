"use client";
import { useState, useTransition } from "react";
import { activarItemChecklist, guardarItemChecklist, moverItemChecklist } from "@/app/central/modulos-actions";
import type { ItemChecklist } from "@/lib/dominio/checklist";

/** Editor de los ítems del checklist: añadir, editar, quitar (desactivar) y ordenar. */
export default function EditorChecklist({ items }: { items: ItemChecklist[] }) {
  const [pend, ini] = useTransition();
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const correr = (f: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) => ini(async () => {
    setError(null);
    const r = await f();
    if (!r.ok) setError(r.error ?? "Error"); else despues?.();
  });
  const btn = "rounded border border-slate-600 px-2 py-1 text-sm disabled:opacity-40";
  const campo = "rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm";
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Ítems del checklist</h2>
      <ol className="space-y-2">
        {items.map((i, k) => (
          // Rejilla: en el móvil los botones van debajo del texto, siempre alineados en la misma columna.
          <li key={i.id} className={`grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto] ${i.activo ? "" : "opacity-50"}`}>
            <span className="text-right text-slate-500">{k + 1}.</span>
            {editando?.id === i.id
              ? <input aria-label="Texto del ítem" value={editando.texto} maxLength={120} onChange={(e) => setEditando({ id: i.id, texto: e.target.value })} className={`${campo} w-full min-w-0`} />
              : <span className="min-w-0 break-words">{i.texto}{!i.activo && " (quitado)"}</span>}
            <div className="col-start-2 flex flex-wrap gap-2 sm:col-start-3 sm:justify-end">
            <button type="button" disabled={pend || k === 0} onClick={() => correr(() => moverItemChecklist(i.id, -1))} className={btn} aria-label={`Subir ${i.texto}`}>↑</button>
            <button type="button" disabled={pend || k === items.length - 1} onClick={() => correr(() => moverItemChecklist(i.id, 1))} className={btn} aria-label={`Bajar ${i.texto}`}>↓</button>
            {editando?.id === i.id
              ? <button type="button" disabled={pend} onClick={() => correr(() => guardarItemChecklist(editando), () => setEditando(null))} className={btn}>Guardar</button>
              : <button type="button" disabled={pend} onClick={() => setEditando({ id: i.id, texto: i.texto })} className={btn}>Editar</button>}
            <button type="button" disabled={pend} onClick={() => correr(() => activarItemChecklist(i.id, !i.activo))} className={btn}>{i.activo ? "Quitar" : "Recuperar"}</button>
            </div>
          </li>
        ))}
      </ol>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); correr(() => guardarItemChecklist({ texto: nuevo }), () => setNuevo("")); }}>
        <input aria-label="Nuevo ítem" placeholder="Nuevo ítem (p. ej. Botiquín)" value={nuevo} maxLength={120} onChange={(e) => setNuevo(e.target.value)} className={`${campo} flex-1`} />
        <button disabled={pend || !nuevo.trim()} className="rounded-lg bg-marca px-3 py-1 text-sm text-white disabled:opacity-50">Añadir</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
