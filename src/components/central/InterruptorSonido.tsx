"use client";
import { useEffect, useSyncExternalStore } from "react";
import { fijarSonidosActivos, prepararDesbloqueo, reproducir, sonidosActivos, suscribirSonidos } from "@/lib/sonidos";

/** Interruptor 🔊/🔇 de los sonidos de la central (se recuerda en este navegador). Desbloquea el audio al primer gesto. */
export default function InterruptorSonido({ className = "" }: { className?: string }) {
  const activo = useSyncExternalStore(suscribirSonidos, sonidosActivos, () => true);
  useEffect(() => prepararDesbloqueo(), []);
  const cambiar = () => {
    const v = !activo;
    fijarSonidosActivos(v);
    if (v) reproducir("en_camino"); // confirmación audible (y el clic desbloquea el audio)
  };
  return (
    <button type="button" onClick={cambiar} aria-pressed={activo}
      aria-label={activo ? "Sonidos de la central activados. Pulsa para silenciar" : "Sonidos de la central silenciados. Pulsa para activar"}
      title={activo ? "Sonidos activados" : "Sonidos silenciados"}
      className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm ${activo ? "border-slate-600 text-slate-200 hover:border-marca-claro" : "border-amber-600 text-amber-300"} ${className}`}>
      <span aria-hidden="true" className="text-lg leading-none">{activo ? "🔊" : "🔇"}</span>
      <span className="hidden md:inline">{activo ? "Sonidos" : "Silenciado"}</span>
    </button>
  );
}
