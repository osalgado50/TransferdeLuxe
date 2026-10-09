"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { fueraDeServicio } from "@/app/conductor/actions";

const CLAVE = "tdl-en-servicio";
const CADA_MS = 15_000;

export default function InterruptorServicio({ conductorId }: { conductorId: string }) {
  const [activo, setActivo] = useState(false);
  const [listo, setListo] = useState(false);
  const [denegado, setDenegado] = useState(false);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const watch = useRef<number | null>(null);
  const ultimoEnvio = useRef(0);

  const parar = useCallback(() => {
    if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; }
  }, []);

  const iniciar = useCallback(() => {
    if (!("geolocation" in navigator) || watch.current !== null) return;
    setDenegado(false);
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const ahora = Date.now();
        if (ahora - ultimoEnvio.current < CADA_MS) return;
        ultimoEnvio.current = ahora;
        void clienteNavegador().from("posiciones").insert({
          conductor_id: conductorId, lat: pos.coords.latitude, lng: pos.coords.longitude,
          velocidad: pos.coords.speed, precision_m: pos.coords.accuracy,
        }).then(({ error }) => { if (!error) setUltimo(ahora); });
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) setDenegado(true); },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  }, [conductorId]);

  useEffect(() => {
    let guardado = false;
    try { guardado = localStorage.getItem(CLAVE) === "1"; } catch { /* sin almacenamiento */ }
    setActivo(guardado); setListo(true);
  }, []);
  useEffect(() => {
    if (!listo) return;
    if (activo) iniciar(); else parar();
    return parar;
  }, [activo, listo, iniciar, parar]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  function alternar() {
    const nuevo = !activo;
    setActivo(nuevo);
    try { localStorage.setItem(CLAVE, nuevo ? "1" : "0"); } catch { /* ignorar */ }
    if (!nuevo) { setUltimo(null); setDenegado(false); ultimoEnvio.current = 0; void fueraDeServicio(); }
  }

  const hace = ultimo ? Math.max(0, Math.round((Date.now() - ultimo) / 1000)) : null;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={alternar} aria-pressed={activo} disabled={!listo}
        className={`min-h-14 rounded-xl px-5 text-base font-semibold ${activo ? "bg-green-500 text-slate-950" : "border border-slate-500 text-slate-200"}`}>
        {activo ? "En servicio" : "Fuera de servicio"}
      </button>
      {activo && !denegado && <span className="text-xs text-slate-400">📍 enviando{hace !== null ? ` · hace ${hace}s` : " · esperando GPS…"}</span>}
      {activo && denegado && <p role="alert" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white">Activa la ubicación para que la central te vea</p>}
    </div>
  );
}
