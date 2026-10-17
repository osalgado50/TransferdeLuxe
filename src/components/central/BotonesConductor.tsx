"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarConductor, reactivarConductor, type ResultadoConductor } from "@/app/central/flota/conductores-actions";

/** ✕ roja junto a «Guardar»: elimina el conductor (o lo da de baja si tiene historial), con confirmación. */
export function BotonEliminarConductor({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [pend, ini] = useTransition();
  const hacer = () => {
    if (!confirm(`¿Eliminar a ${nombre}?\n\nSi no tiene historial se borra del todo. Si lo tiene (servicios, jornadas, tickets), se da de baja: no podrá entrar ni recibir servicios, su historial se conserva y podrás reactivarlo.\n\nSus servicios por hacer volverán a la central.`)) return;
    ini(async () => {
      let r: ResultadoConductor;
      try { r = await eliminarConductor(id); } catch { r = { ok: false, mensaje: "No se pudo completar. Recarga la página e inténtalo de nuevo." }; }
      alert(r.mensaje);
      router.refresh();
    });
  };
  return (
    <button type="button" onClick={hacer} disabled={pend} aria-label={`Eliminar a ${nombre}`} title="Eliminar conductor"
      className="flex size-9 shrink-0 items-center justify-center rounded border-2 border-red-500 text-lg font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50">✕</button>
  );
}

export function BotonReactivarConductor({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [pend, ini] = useTransition();
  return (
    <button type="button" disabled={pend} onClick={() => ini(async () => {
      let r: ResultadoConductor;
      try { r = await reactivarConductor(id); } catch { r = { ok: false, mensaje: "No se pudo completar. Recarga la página e inténtalo de nuevo." }; }
      alert(r.mensaje);
      router.refresh();
    })} className="rounded border border-emerald-600 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50">
      Reactivar a {nombre}
    </button>
  );
}
