"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { accionCentral, marcarIncidenciaVista } from "@/app/central/actions";

export function MarcarVista({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  useEffect(() => { marcarIncidenciaVista(servicioId).then(() => router.refresh()).catch(() => {}); }, [servicioId, router]);
  return null;
}

export default function AccionesFicha({ servicioId, estado }: { servicioId: string; estado: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const activo = !["completado", "cancelado", "subcontratado"].includes(estado);
  const lanzar = (accion: "cancelar" | "subcontratar") => {
    if (!confirm(accion === "cancelar" ? "¿Cancelar el servicio?" : "¿Marcar como subcontratado?")) return;
    ini(async () => {
      const r = await accionCentral({ idAccion: crypto.randomUUID(), servicioId, accion });
      setMsg(r.ok ? null : r.error ?? "No se pudo completar la acción");
    });
  };
  if (!activo) return null;
  const b = "rounded-lg border px-4 py-2 text-sm disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Task 11 sustituye este botón por DialogoAsignar */}
      <button type="button" data-accion="asignar" disabled className={`${b} border-amber-400 text-amber-400`}>Asignar</button>
      <button type="button" data-accion="cancelar" disabled={pend} onClick={() => lanzar("cancelar")} className={`${b} border-red-500 text-red-400`}>Cancelar</button>
      <button type="button" data-accion="subcontratar" disabled={pend} onClick={() => lanzar("subcontratar")} className={`${b} border-orange-500 text-orange-300`}>Subcontratar</button>
      {msg && <span role="alert" className="text-sm text-red-400">{msg}</span>}
    </div>
  );
}
