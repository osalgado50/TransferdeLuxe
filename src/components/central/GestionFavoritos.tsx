"use client";
import { useState, useTransition } from "react";
import { borrarFavorito, renombrarFavorito } from "@/app/central/favoritos/actions";
import type { Favorito } from "@/lib/dominio/favoritos";

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const boton = "rounded bg-marca px-3 py-1 text-sm font-medium text-white hover:bg-marca-oscuro";

export default function GestionFavoritos({ favoritos }: { favoritos: Favorito[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string }>();
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [pendiente, empezar] = useTransition();

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    empezar(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, texto: r.ok ? ok : (r.error ?? "Error") });
    });
  }

  if (!favoritos.length) return <p className="text-sm text-slate-400">Aún no hay favoritos. Guárdalos desde «Nuevo servicio» con ⭐.</p>;
  return (
    <div className="space-y-1">
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.texto}</p>}
      {favoritos.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 border-t border-slate-700 py-1">
          <span className="w-24 text-xs text-slate-400">{f.tipo === "trayecto" ? "Trayecto" : "Dirección"}</span>
          <input value={nombres[f.id] ?? f.nombre} onChange={(e) => setNombres({ ...nombres, [f.id]: e.target.value })}
            aria-label="Nombre del favorito" maxLength={60} className={`${campo} w-48`} />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-400">
            {f.origen_texto}{f.destino_texto ? ` → ${f.destino_texto}` : ""}
          </span>
          <button type="button" disabled={pendiente || (nombres[f.id] ?? f.nombre) === f.nombre} className={boton}
            onClick={() => ejecutar(() => renombrarFavorito(f.id, nombres[f.id] ?? f.nombre), "Favorito renombrado")}>Renombrar</button>
          <button type="button" disabled={pendiente} className="rounded border border-red-500 px-3 py-1 text-sm text-red-300 hover:bg-red-950"
            onClick={() => { if (window.confirm(`¿Borrar el favorito «${f.nombre}»?`)) ejecutar(() => borrarFavorito(f.id), "Favorito borrado"); }}>Borrar</button>
        </div>
      ))}
    </div>
  );
}
