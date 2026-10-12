"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { jornadaConductor } from "@/app/conductor/modulos-actions";
import { formatoDuracion, resumenConductor, type AccionJornada, type Jornada } from "@/lib/dominio/jornada";
import { EVENTO_APAGAR, EVENTO_ENCENDER, type ResultadoEncender } from "./InterruptorServicio";
import HojaCierre, { type VehiculoCierre } from "./HojaCierre";
import { ICONO_GRAVEDAD, type GravedadCierre } from "@/lib/dominio/cierre";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

/**
 * Jornada laboral (registro horario). «Iniciar jornada» enciende antes el GPS del navegador (interruptor «En servicio»):
 * sin permiso de ubicación NO se inicia. «Finalizar» (tras la hoja de cierre, si está activa) lo apaga. La pausa no lo toca.
 * Con `cierre`, «Finalizar jornada» abre la hoja de cierre (precargada con las zonas de los golpes de hoy: `acumulado`).
 */
export default function JornadaConductor({ jornadas, cierre = null, acumulado = { zonas: [], resumen: [] } }: {
  jornadas: Jornada[]; cierre?: { vehiculos: VehiculoCierre[]; vehiculoInicial: string | null } | null;
  acumulado?: { zonas: string[]; resumen: string[] };
}) {
  const router = useRouter();
  const [ahora, setAhora] = useState(() => new Date());
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sinGps, setSinGps] = useState<string | null>(null);
  const [gpsApagado, setGpsApagado] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [enviado, setEnviado] = useState<GravedadCierre | null>(null);
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  const r = resumenConductor(jornadas, ahora);
  const pausa = r.abierta?.pausas?.find((p) => !p.fin) ?? null;

  const apagarGps = () => { window.dispatchEvent(new CustomEvent(EVENTO_APAGAR, { detail: { tareas: [] } })); setGpsApagado(true); };
  const hacer = (a: AccionJornada) => ini(async () => {
    setError(null); setSinGps(null);
    if (a === "iniciar") {
      const tareas: Promise<ResultadoEncender>[] = [];
      window.dispatchEvent(new CustomEvent(EVENTO_ENCENDER, { detail: { tareas } }));
      const g = (await Promise.all(tareas))[0];
      if (g && !g.ok) {
        setSinGps(`No se ha iniciado la jornada: ${g.error} La jornada se trabaja con el GPS activo. Permite la ubicación para esta web (icono del candado junto a la dirección, o Ajustes del móvil) y vuelve a pulsar «Iniciar jornada».`);
        return;
      }
      if (g?.ok && g.aviso) setSinGps(g.aviso);
    }
    const res = await jornadaConductor(a);
    if (!res.ok) { setError(res.error); return; }
    if (a === "finalizar") apagarGps();
    if (a === "iniciar") setGpsApagado(false);
    router.refresh();
  });
  const btn = "min-h-14 w-full rounded-xl px-4 text-lg font-semibold disabled:opacity-50";

  return (
    <section aria-label="Jornada laboral" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-marca-claro">Jornada</h2>
      </div>
      <p className={`text-2xl font-bold ${r.estado === "trabajando" ? "text-green-400" : r.estado === "en_pausa" ? "text-amber-300" : "text-slate-300"}`}>
        {r.estado === "fuera" ? "Sin iniciar" : r.estado === "en_pausa" ? `⏸ En pausa desde las ${pausa ? hora(pausa.inicio) : "--:--"}` : `● Trabajando desde las ${hora(r.abierta!.inicio)}`}
      </p>
      <p className="text-base text-slate-400">Hoy: <strong className="text-slate-100">{formatoDuracion(r.msHoy)}</strong> · Semana: <strong className="text-slate-100">{formatoDuracion(r.msSemana)}</strong></p>
      <div className="grid gap-3">
        {r.estado === "fuera" && <button type="button" disabled={pend} onClick={() => hacer("iniciar")} className={`${btn} min-h-16 bg-green-600 text-xl text-white`}>{pend ? "Activando GPS…" : "▶ Iniciar jornada"}</button>}
        {r.estado === "fuera" && <p className="text-sm text-slate-400">Al iniciar se activa el GPS («En servicio»): la central verá dónde estás mientras trabajas.</p>}
        {r.estado === "trabajando" && <button type="button" disabled={pend} onClick={() => hacer("pausa")} className={`${btn} bg-amber-600 text-white`}>⏸ Pausa</button>}
        {r.estado === "en_pausa" && <button type="button" disabled={pend} onClick={() => hacer("reanudar")} className={`${btn} bg-amber-600 text-white`}>▶ Reanudar</button>}
        {r.estado !== "fuera" && <button type="button" disabled={pend} onClick={() => { if (cierre) { setEnviado(null); setHoja(true); } else if (confirm("¿Finalizar la jornada de hoy? Se apagará el GPS.")) hacer("finalizar"); }} className={`${btn} border-2 border-slate-500`}>🏁 Finalizar jornada</button>}
      </div>
      {sinGps && <p role="alert" className="rounded-lg border border-red-500 bg-red-950 p-3 text-sm text-red-100">{sinGps}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {enviado && (
        <p role="status" className="text-sm text-slate-200">{ICONO_GRAVEDAD[enviado]} Hoja de cierre enviada a la central{enviado === "ok" ? ": vehículo listo para mañana." : enviado === "grave" ? ": la central revisará los daños." : ": la central programará el mantenimiento."}</p>
      )}
      {gpsApagado && r.estado === "fuera" && <p role="status" className="text-sm text-slate-300">GPS apagado («Fuera de servicio»): ya no se envía tu ubicación.</p>}
      {hoja && cierre && (
        <HojaCierre vehiculos={cierre.vehiculos} vehiculoInicial={cierre.vehiculoInicial} zonasIniciales={acumulado.zonas} incidenciasHoy={acumulado.resumen}
          alCancelar={() => setHoja(false)} alEnviado={(g) => { setHoja(false); setEnviado(g); apagarGps(); router.refresh(); }} />
      )}
    </section>
  );
}
