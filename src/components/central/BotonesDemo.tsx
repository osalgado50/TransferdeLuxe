"use client";
import { useEffect, useRef, useState } from "react";
import { restablecerDemo, simularPaso } from "@/app/central/demo-actions";

export default function BotonesDemo() {
  const [simulando, setSimulando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const parar = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setSimulando(false); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const paso = () => simularPaso().catch((e) => { setError(e instanceof Error ? e.message : "Error"); parar(); });
  const alternar = () => {
    if (simulando) return parar();
    setError(null); setSimulando(true); void paso();
    timer.current = setInterval(() => void paso(), 3000);
  };
  const restablecer = async () => {
    if (!window.confirm("¿Restablecer todos los datos de demo? Se borrarán los cambios actuales.")) return;
    parar(); setOcupado(true); setError(null);
    try { await restablecerDemo(); window.location.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); setOcupado(false); }
  };
  const base = "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2" data-demo>
      <button type="button" onClick={alternar} disabled={ocupado} className={`${base} border-amber-500 text-amber-300`}>
        {simulando ? "■ Parar simulación" : "▶ Simular ruta"}
      </button>
      <button type="button" onClick={restablecer} disabled={ocupado} className={`${base} border-slate-600 text-slate-200`}>
        {ocupado ? "Restableciendo…" : "↺ Restablecer demo"}
      </button>
      {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
