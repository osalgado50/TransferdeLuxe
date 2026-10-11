"use client";
import { useState, useTransition } from "react";
import { incidenciaConductor } from "@/app/conductor/modulos-actions";
import { TIPOS_INCIDENCIA } from "@/lib/dominio/incidencias";
import { redimensionar } from "@/lib/imagen";

function posicion(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!("geolocation" in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 5000, maximumAge: 120_000 });
  });
}

/** Botón «Incidencia» del conductor: tipo, descripción, foto opcional y posición. */
export default function BotonIncidencia({ servicioId }: { servicioId?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("");
  const [desc, setDesc] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pend, ini] = useTransition();

  const enviar = () => ini(async () => {
    setError(null);
    const fd = new FormData();
    fd.set("tipo", tipo); fd.set("descripcion", desc);
    if (servicioId) fd.set("servicio_id", servicioId);
    if (foto) {
      try { fd.set("foto", new File([await redimensionar(foto)], "incidencia.jpg", { type: "image/jpeg" })); }
      catch { setError("No se pudo procesar la foto"); return; }
    }
    const p = await posicion();
    if (p) { fd.set("lat", String(p.coords.latitude)); fd.set("lng", String(p.coords.longitude)); }
    const r = await incidenciaConductor(fd);
    if (!r.ok) { setError(r.error); return; }
    setEnviado(true); setTipo(""); setDesc(""); setFoto(null);
  });

  if (!abierto) return (
    <button type="button" onClick={() => { setAbierto(true); setEnviado(false); }}
      className="min-h-14 w-full rounded-xl border border-red-500 px-4 text-lg font-semibold text-red-300">⚠ Incidencia</button>
  );
  return (
    <section aria-label="Comunicar incidencia" className="space-y-3 rounded-xl border border-red-500 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold text-red-300">Comunicar incidencia</h2>
      {enviado ? <p role="status" className="text-green-400">Incidencia enviada a la central.</p> : <>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_INCIDENCIA.map((t) => (
            <button key={t.clave} type="button" aria-pressed={tipo === t.clave} onClick={() => setTipo(t.clave)}
              className={`min-h-12 rounded-lg border px-2 text-sm ${tipo === t.clave ? "border-red-400 bg-red-500/20 text-white" : "border-slate-600"}`}>{t.nombre}</button>
          ))}
        </div>
        <label className="block text-sm">Descripción
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2" />
        </label>
        <label className="block text-sm">Foto (opcional)
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
        </label>
      </>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        {!enviado && <button type="button" disabled={pend || !tipo} onClick={enviar} className="min-h-12 flex-1 rounded-lg bg-red-600 font-semibold text-white disabled:opacity-50">{pend ? "Enviando…" : "Enviar"}</button>}
        <button type="button" onClick={() => setAbierto(false)} className="min-h-12 flex-1 rounded-lg border border-slate-600">{enviado ? "Cerrar" : "Cancelar"}</button>
      </div>
    </section>
  );
}
