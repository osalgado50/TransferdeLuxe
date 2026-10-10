"use client";
import { useEffect, useRef, useState } from "react";
import { simularPaso } from "@/app/central/demo-actions";

export default function BotonesDemo() {
  const [simulando, setSimulando] = useState(false);
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
  const base = "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2" data-demo>
      <button type="button" onClick={alternar} className={`${base} border-marca-claro text-marca-claro`}>
        {simulando ? "■ Parar simulación" : "▶ Simular ruta"}
      </button>
      {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
