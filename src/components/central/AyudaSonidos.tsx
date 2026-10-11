"use client";
import { SONIDOS } from "@/lib/dominio/sonidos";
import { reproducir } from "@/lib/sonidos";

/** Leyenda de los sonidos de la central con un botón para escuchar cada uno (suena aunque el panel esté silenciado). */
export default function AyudaSonidos() {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {SONIDOS.map((s) => (
        <li key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
          <button type="button" onClick={() => reproducir(s.id)} aria-label={`Escuchar: ${s.significado}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-600 text-marca-claro hover:border-marca-claro">
            <span aria-hidden="true">▶</span>
          </button>
          <span><span className="font-medium">{s.significado}</span><br /><span className="text-slate-400">{s.nombre}</span></span>
        </li>
      ))}
    </ul>
  );
}
