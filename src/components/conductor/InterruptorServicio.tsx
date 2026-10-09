"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { fueraDeServicio } from "@/app/conductor/actions";

const CADA_MS = 15_000;
export const EVENTO_APAGAR = "tdl-apagar";

export default function InterruptorServicio({ conductorId }: { conductorId: string }) {
  const clave = `tdl-en-servicio:${conductorId}`;
  const [activo, setActivo] = useState(false);
  const [listo, setListo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState(false);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const watch = useRef<number | null>(null);
  const ultimoEnvio = useRef(0);
  const gen = useRef(0);
  const pendiente = useRef<Promise<unknown> | null>(null);

  const detener = useCallback(() => {
    gen.current++;
    if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; }
  }, []);

  const iniciar = useCallback(() => {
    if (watch.current !== null) return;
    if (!("geolocation" in navigator)) { setAviso("Este dispositivo no permite usar la ubicación"); return; }
    setAviso(null);
    const g = ++gen.current;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setAviso(null);
        const ahora = Date.now();
        if (ahora - ultimoEnvio.current < CADA_MS || pendiente.current) return;
        if (g !== gen.current) return; // se apagó el servicio: no enviar
        const p = Promise.resolve(clienteNavegador().from("posiciones").insert({
          conductor_id: conductorId, lat: pos.coords.latitude, lng: pos.coords.longitude,
          velocidad: pos.coords.speed, precision_m: pos.coords.accuracy,
        })).then(({ error }) => {
          if (error) { setErrorEnvio(true); return; } // sin throttle: reintenta en el próximo fix
          ultimoEnvio.current = ahora; setUltimo(ahora); setErrorEnvio(false);
        }, () => setErrorEnvio(true)).finally(() => { pendiente.current = null; });
        pendiente.current = p;
      },
      (err) => {
        setAviso(err.code === err.PERMISSION_DENIED ? "Activa la ubicación para que la central te vea"
          : "No se puede obtener tu ubicación; comprueba la señal GPS");
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  }, [conductorId]);

  // Apagar: parar el GPS, esperar el envío en vuelo y solo entonces marcar fuera de servicio.
  const apagar = useCallback(async () => {
    detener();
    try { await pendiente.current; } catch { /* ignorar */ }
    await fueraDeServicio();
  }, [detener]);

  useEffect(() => {
    let guardado = false;
    try { guardado = localStorage.getItem(clave) === "1"; } catch { /* sin almacenamiento */ }
    setActivo(guardado); setListo(true);
  }, [clave]);
  useEffect(() => {
    if (!listo) return;
    if (activo) iniciar(); else detener();
    return detener;
  }, [activo, listo, iniciar, detener]);
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [activo]);
  useEffect(() => {
    const h = (e: Event) => { (e as CustomEvent<{ tareas: Promise<unknown>[] }>).detail.tareas.push(apagar()); };
    window.addEventListener(EVENTO_APAGAR, h);
    return () => window.removeEventListener(EVENTO_APAGAR, h);
  }, [apagar]);

  function alternar() {
    const nuevo = !activo;
    setActivo(nuevo);
    try { localStorage.setItem(clave, nuevo ? "1" : "0"); } catch { /* ignorar */ }
    if (!nuevo) { setUltimo(null); setAviso(null); setErrorEnvio(false); ultimoEnvio.current = 0; void apagar(); }
  }

  const hace = ultimo ? Math.max(0, Math.round((Date.now() - ultimo) / 1000)) : null;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={alternar} aria-pressed={activo} disabled={!listo}
        className={`min-h-14 rounded-xl px-5 text-base font-semibold ${activo ? "bg-green-500 text-slate-950" : "border border-slate-500 text-slate-200"}`}>
        {activo ? "En servicio" : "Fuera de servicio"}
      </button>
      {activo && !aviso && (
        <span className={`text-xs ${errorEnvio ? "text-red-400" : "text-slate-400"}`}>
          {errorEnvio ? "📍 error al enviar" : `📍 enviando${hace !== null ? ` · hace ${hace}s` : " · esperando GPS…"}`}
        </span>
      )}
      {activo && aviso && <p role="alert" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white">{aviso}</p>}
    </div>
  );
}
