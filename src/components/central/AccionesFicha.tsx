"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DialogoAsignar from "./DialogoAsignar";
import { accionCentral, marcarIncidenciaVista } from "@/app/central/actions";
import { preguntaDeshacer } from "@/lib/dominio/deshacer";
import type { EstadoServicio } from "@/lib/dominio/tipos";

export function MarcarVista({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  useEffect(() => { marcarIncidenciaVista(servicioId).then(() => router.refresh()).catch(() => {}); }, [servicioId, router]);
  return null;
}

export default function AccionesFicha({ servicioId, estado }: { servicioId: string; estado: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const router = useRouter();
  const activo = !["completado", "cancelado", "subcontratado"].includes(estado);
  // La central puede deshacer el último paso del conductor (salida, carga o descarga) sin límite de tiempo.
  const pregunta = preguntaDeshacer(estado as EstadoServicio);
  const lanzar = (accion: "cancelar" | "subcontratar" | "deshacer") => {
    const texto = accion === "cancelar" ? "¿Cancelar el servicio?" : accion === "subcontratar" ? "¿Marcar como subcontratado?" : pregunta;
    if (!texto || !confirm(texto)) return;
    ini(async () => {
      const r = await accionCentral({ idAccion: crypto.randomUUID(), servicioId, accion });
      setMsg(r.ok ? null : r.error ?? "No se pudo completar la acción");
      if (r.ok) router.refresh();
    });
  };
  if (!activo && !pregunta) return null;
  const b = "rounded-lg border px-4 py-2 text-sm disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-3">
      {activo && <DialogoAsignar servicioId={servicioId} reasignar={["asignado", "aceptado"].includes(estado)} />}
      {activo && <button type="button" data-accion="cancelar" disabled={pend} onClick={() => lanzar("cancelar")} className={`${b} border-red-500 text-red-400`}>Cancelar</button>}
      {activo && <button type="button" data-accion="subcontratar" disabled={pend} onClick={() => lanzar("subcontratar")} className={`${b} border-orange-500 text-orange-300`}>Subcontratar</button>}
      {pregunta && <button type="button" data-accion="deshacer" disabled={pend} onClick={() => lanzar("deshacer")} className={`${b} border-amber-400 text-amber-200`}>↩ Deshacer último paso</button>}
      {msg && <span role="alert" className="text-sm text-red-400">{msg}</span>}
    </div>
  );
}
