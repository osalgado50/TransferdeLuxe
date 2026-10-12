"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { incidenciaConductor } from "@/app/conductor/modulos-actions";
import DiagramaVehiculo from "@/components/comun/DiagramaVehiculo";
import { alternarZona } from "@/lib/dominio/cierre";
import { TIPOS_INCIDENCIA, admiteZonas, esIncidenciaGrave } from "@/lib/dominio/incidencias";
import { redimensionar } from "@/lib/imagen";

function posicion(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!("geolocation" in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 5000, maximumAge: 120_000 });
  });
}

/** Botón «Incidencia» del conductor: tipo, parte de golpes (accidente / golpe), descripción, foto opcional y posición. */
export default function BotonIncidencia({ servicioId, grande = false }: { servicioId?: string; grande?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("");
  const [desc, setDesc] = useState("");
  const [zonas, setZonas] = useState<string[]>([]);
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const conZonas = admiteZonas(tipo);

  const enviar = () => ini(async () => {
    setError(null);
    const fd = new FormData();
    fd.set("tipo", tipo); fd.set("descripcion", desc);
    if (servicioId) fd.set("servicio_id", servicioId);
    if (conZonas) for (const z of zonas) fd.append("zonas", z);
    if (foto) {
      try { fd.set("foto", new File([await redimensionar(foto)], "incidencia.jpg", { type: "image/jpeg" })); }
      catch { setError("No se pudo procesar la foto"); return; }
    }
    const p = await posicion();
    if (p) { fd.set("lat", String(p.coords.latitude)); fd.set("lng", String(p.coords.longitude)); }
    const r = await incidenciaConductor(fd);
    if (!r.ok) { setError(r.error); return; }
    setEnviado(esIncidenciaGrave(tipo) ? "Enviada a la central con alarma. Si hay heridos o peligro, llama al 112." : "Incidencia enviada a la central.");
    setTipo(""); setDesc(""); setZonas([]); setFoto(null);
    router.refresh();
  });

  if (!abierto) return (
    <button type="button" onClick={() => { setAbierto(true); setEnviado(null); }}
      className={`w-full rounded-xl border-2 border-red-500 px-4 font-semibold text-red-300 ${grande ? "min-h-16 text-xl" : "min-h-14 text-lg"}`}>
      {grande ? "⚠ Comunicar incidencia" : "⚠ Incidencia"}
    </button>
  );
  return (
    <section aria-label="Comunicar incidencia" className="space-y-3 rounded-xl border border-red-500 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold text-red-300">Comunicar incidencia</h2>
      {enviado ? <p role="status" className="text-green-400">{enviado}</p> : <>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_INCIDENCIA.map((t) => (
            <button key={t.clave} type="button" aria-pressed={tipo === t.clave} onClick={() => setTipo(t.clave)}
              className={`min-h-12 rounded-lg border px-2 text-sm ${tipo === t.clave ? "border-red-400 bg-red-500/20 text-white" : "border-slate-600"}`}>{t.boton}</button>
          ))}
        </div>
        {tipo && esIncidenciaGrave(tipo) && <p className="rounded-lg bg-red-950 p-2 text-sm font-semibold text-red-100">🚨 Se avisa a la central con alarma.</p>}
        {conZonas && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Parte de golpes: toca las zonas dañadas</p>
            <DiagramaVehiculo zonas={zonas} alAlternar={(id) => setZonas((z) => alternarZona(z, id))} />
            <p className="text-sm text-slate-400" aria-live="polite">{zonas.length ? `${zonas.length} zona${zonas.length > 1 ? "s" : ""} marcada${zonas.length > 1 ? "s" : ""}` : "Sin zonas marcadas"}</p>
          </div>
        )}
        <label className="block text-sm">Descripción{tipo === "accidente" || tipo === "otro" ? " (obligatoria)" : ""}
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
