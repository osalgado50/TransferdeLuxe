"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DialogoAsignar from "./DialogoAsignar";
import { accionCentral, marcarIncidenciaVista } from "@/app/central/actions";
import { preguntaDeshacer } from "@/lib/dominio/deshacer";
import type { EstadoServicio } from "@/lib/dominio/tipos";

// Abrir la ficha ya no marca la incidencia como vista para todos: lo decide el operador con este botón.
export function MarcarVista({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  const [pend, ini] = useTransition();
  const [error, setError] = useState(false);
  const marcar = () => ini(async () => {
    try { await marcarIncidenciaVista(servicioId); setError(false); router.refresh(); } catch { setError(true); }
  });
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" data-accion="marcar-vista" disabled={pend} onClick={marcar}
        className="rounded-md border border-red-400/60 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50">
        {pend ? "Marcando…" : "Marcar como vista"}
      </button>
      {error && <span role="alert" className="text-xs text-red-400">No se pudo marcar</span>}
    </span>
  );
}

export default function AccionesFicha({ servicioId, estado }: { servicioId: string; estado: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const router = useRouter();
  const activo = !["completado", "cancelado", "subcontratado"].includes(estado);
  // La central puede deshacer el último paso del conductor (salida, carga o descarga) sin límite de tiempo.
  const pregunta = preguntaDeshacer(estado as EstadoServicio);
  // Con conductor (también en camino o con el cliente a bordo): la central se lo puede quitar, pasar a otro o cerrarlo.
  const conConductor = ["asignado", "aceptado", "en_camino", "recogido"].includes(estado);
  const enCurso = estado === "en_camino" || estado === "recogido";
  const PREGUNTAS = {
    cancelar: enCurso ? "El conductor ya está en marcha. ¿Cancelar el servicio igualmente? Se le avisará." : "¿Cancelar el servicio?",
    subcontratar: conConductor ? "¿Subcontratar el servicio? Se le quitará al conductor y se le avisará." : "¿Marcar como subcontratado?",
    desasignar: "¿Quitar el servicio al conductor? Vuelve a «Sin asignar» para dárselo a otro y se le avisará.",
    completar: "¿Dar el servicio por terminado? Úsalo si el conductor lo hizo pero no lo cerró en la app.",
  } as const;
  const lanzar = (accion: "cancelar" | "subcontratar" | "deshacer" | "desasignar" | "completar") => {
    const texto = accion === "deshacer" ? pregunta : PREGUNTAS[accion];
    if (!texto || !confirm(texto)) return;
    ini(async () => {
      // Con el estado que ve el operador: si el conductor ha avanzado mientras tanto, el servidor no lo hace.
      const r = await accionCentral({ idAccion: crypto.randomUUID(), servicioId, accion, estadoEsperado: estado as EstadoServicio });
      setMsg(r.ok ? null : r.error ?? "No se pudo completar la acción");
      router.refresh();
    });
  };
  if (!activo && !pregunta) return null;
  const b = "rounded-lg border px-4 py-2 text-sm disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-3">
      {activo && <DialogoAsignar servicioId={servicioId} reasignar={conConductor} />}
      {conConductor && <button type="button" data-accion="desasignar" disabled={pend} onClick={() => lanzar("desasignar")} className={`${b} border-sky-500 text-sky-300`}>Quitar conductor</button>}
      {activo && <button type="button" data-accion="cancelar" disabled={pend} onClick={() => lanzar("cancelar")} className={`${b} border-red-500 text-red-400`}>Cancelar</button>}
      {activo && <button type="button" data-accion="subcontratar" disabled={pend} onClick={() => lanzar("subcontratar")} className={`${b} border-orange-500 text-orange-300`}>Subcontratar</button>}
      {conConductor && <button type="button" data-accion="completar" disabled={pend} onClick={() => lanzar("completar")} className={`${b} border-green-500 text-green-300`}>✓ Cerrar como completado</button>}
      {pregunta && <button type="button" data-accion="deshacer" disabled={pend} onClick={() => lanzar("deshacer")} className={`${b} border-amber-400 text-amber-200`}>↩ Deshacer último paso</button>}
      {msg && <span role="alert" className="text-sm text-red-400">{msg}</span>}
    </div>
  );
}
