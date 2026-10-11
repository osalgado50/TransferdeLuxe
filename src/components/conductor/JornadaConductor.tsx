"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { jornadaConductor } from "@/app/conductor/modulos-actions";
import { formatoDuracion, resumenConductor, type AccionJornada, type Jornada } from "@/lib/dominio/jornada";
import { EVENTO_APAGAR } from "./InterruptorServicio";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

/** Jornada laboral (registro horario). Independiente del interruptor GPS «En servicio». */
export default function JornadaConductor({ jornadas }: { jornadas: Jornada[] }) {
  const router = useRouter();
  const [ahora, setAhora] = useState(() => new Date());
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sugerirFuera, setSugerirFuera] = useState(false);
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  const r = resumenConductor(jornadas, ahora);

  const hacer = (a: AccionJornada) => ini(async () => {
    setError(null);
    const res = await jornadaConductor(a);
    if (!res.ok) { setError(res.error); return; }
    if (a === "finalizar") setSugerirFuera(true);
    router.refresh();
  });
  const fuera = () => {
    window.dispatchEvent(new CustomEvent(EVENTO_APAGAR, { detail: { tareas: [] } }));
    setSugerirFuera(false);
  };
  const btn = "min-h-14 flex-1 rounded-xl px-4 text-lg font-semibold disabled:opacity-50";

  return (
    <section aria-label="Jornada laboral" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-marca-claro">Jornada</h2>
        <p className="text-sm text-slate-300">
          {r.estado === "fuera" ? "Sin jornada iniciada" : r.estado === "en_pausa" ? "En pausa" : `Trabajando desde las ${hora(r.abierta!.inicio)}`}
        </p>
      </div>
      <p className="text-sm text-slate-400">Hoy: <strong className="text-slate-100">{formatoDuracion(r.msHoy)}</strong> · Semana: <strong className="text-slate-100">{formatoDuracion(r.msSemana)}</strong></p>
      <div className="flex gap-3">
        {r.estado === "fuera" && <button type="button" disabled={pend} onClick={() => hacer("iniciar")} className={`${btn} bg-marca text-white`}>Iniciar jornada</button>}
        {r.estado === "trabajando" && <button type="button" disabled={pend} onClick={() => hacer("pausa")} className={`${btn} border border-amber-500 text-amber-300`}>Pausa</button>}
        {r.estado === "en_pausa" && <button type="button" disabled={pend} onClick={() => hacer("reanudar")} className={`${btn} bg-marca text-white`}>Reanudar</button>}
        {r.estado !== "fuera" && <button type="button" disabled={pend} onClick={() => { if (confirm("¿Finalizar la jornada de hoy?")) hacer("finalizar"); }} className={`${btn} border border-slate-500`}>Finalizar jornada</button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {sugerirFuera && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-800 p-3 text-sm">
          <span className="flex-1">Jornada finalizada. ¿Te pones también fuera de servicio (deja de enviar GPS)?</span>
          <button type="button" onClick={fuera} className="min-h-11 rounded-lg bg-marca px-3 text-white">Fuera de servicio</button>
          <button type="button" onClick={() => setSugerirFuera(false)} className="min-h-11 rounded-lg border border-slate-600 px-3">No</button>
        </div>
      )}
    </section>
  );
}
