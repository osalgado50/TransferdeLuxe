"use client";
import { useState } from "react";
import { salir } from "@/app/login/actions";
import { fueraDeServicio } from "@/app/conductor/actions";
import { EVENTO_APAGAR } from "./InterruptorServicio";

export default function BotonSalir({ conductorId }: { conductorId: string }) {
  const [ocupado, setOcupado] = useState(false);
  async function alSalir() {
    setOcupado(true);
    try { localStorage.removeItem(`tdl-en-servicio:${conductorId}`); } catch { /* ignorar */ }
    const tareas: Promise<unknown>[] = [];
    window.dispatchEvent(new CustomEvent(EVENTO_APAGAR, { detail: { tareas } }));
    try { if (tareas.length) await Promise.all(tareas); else await fueraDeServicio(); } catch { /* salir igualmente */ }
    await salir();
  }
  return <button type="button" onClick={alSalir} disabled={ocupado} className="min-h-14 w-full text-base font-medium text-slate-300 hover:text-amber-300">Salir</button>;
}
