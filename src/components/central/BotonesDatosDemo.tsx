"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archivarTodosLosServicios, cargarDatosDemo, deshacerArchivado, ultimoArchivado, type ResultadoDemo } from "@/app/central/datos-demo-actions";

/**
 * Datos de demostración en el panel en vivo: cargar un día de ejemplo, archivar todos los servicios (con su historial;
 * se pueden recuperar) y deshacer el último archivado. Para jueces y pruebas: la app siempre tiene algo que enseñar.
 */
export default function BotonesDatosDemo() {
  const router = useRouter();
  const [pend, ini] = useTransition();
  const [r, setR] = useState<ResultadoDemo | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const leerArchivo = () => { ultimoArchivado().then(setArchivo).catch(() => setArchivo(null)); };
  useEffect(leerArchivo, []);
  const hacer = (accion: () => Promise<ResultadoDemo>, pregunta?: string) => {
    if (pregunta && !confirm(pregunta)) return;
    setR(null);
    ini(async () => {
      try { setR(await accion()); } catch { setR({ ok: false, mensaje: "No se pudo completar. Recarga la página e inténtalo de nuevo." }); }
      leerArchivo();
      router.refresh();
    });
  };
  const b = "min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2" data-datos-demo>
      <button type="button" disabled={pend} onClick={() => hacer(cargarDatosDemo)} className={`${b} border-emerald-500 text-emerald-300 hover:bg-emerald-950`}>
        ✨ Cargar datos de demo
      </button>
      <button type="button" disabled={pend}
        onClick={() => hacer(archivarTodosLosServicios, "¿Archivar TODOS los servicios con su historial (eventos, recorridos, incidencias y alertas)?\n\nEl panel quedará vacío. Podrás recuperarlos con «Deshacer».")}
        className={`${b} border-amber-500 text-amber-300 hover:bg-amber-950`}>
        🗄 Archivar todos los servicios
      </button>
      {archivo && (
        <button type="button" disabled={pend} onClick={() => hacer(deshacerArchivado, `¿Recuperar el último archivado (${archivo})?`)}
          className={`${b} border-slate-500 text-slate-200 hover:bg-slate-800`} title={`Último archivado: ${archivo}`}>
          ↩ Deshacer archivado
        </button>
      )}
      {pend && <span role="status" className="text-sm text-slate-400">Un momento…</span>}
      {r && <span role={r.ok ? "status" : "alert"} className={`text-sm ${r.ok ? "text-emerald-300" : "text-red-300"}`}>{r.mensaje}</span>}
    </div>
  );
}
