"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { jornadaConductor, pendientesHoyConductor } from "@/app/conductor/modulos-actions";
import { colaDe, drenar } from "@/lib/offline/colaConductor";
import { accionFinJornada, MOTIVO_FIN_JORNADA, textoPendientes } from "@/lib/dominio/finJornada";
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
type Pendiente = Awaited<ReturnType<typeof pendientesHoyConductor>>[number];

export default function JornadaConductor({ jornadas, cierre = null, acumulado = { zonas: [], resumen: [] }, conductorId }: {
  jornadas: Jornada[]; cierre?: { vehiculos: VehiculoCierre[]; vehiculoInicial: string | null } | null;
  acumulado?: { zonas: string[]; resumen: string[] };
  /** Para devolver por la cola offline los servicios de hoy pendientes al finalizar. */
  conductorId?: string;
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

  // Finalizar: antes de la hoja de cierre, los servicios de HOY aún por hacer (los de mañana son otra jornada).
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [volvere, setVolvere] = useState(false);
  const [devueltos, setDevueltos] = useState<number | null>(null);
  const seguirFinalizando = () => {
    setPendientes(null); setVolvere(false);
    if (cierre) { setEnviado(null); setHoja(true); } else if (confirm("¿Finalizar la jornada de hoy? Se apagará el GPS.")) hacer("finalizar");
  };
  const pulsarFinalizar = () => ini(async () => {
    setError(null); setDevueltos(null);
    let lista: Pendiente[] = [];
    try { lista = await pendientesHoyConductor(); } catch { /* sin conexión: no se bloquea el cierre */ }
    if (lista.length) setPendientes(lista); else seguirFinalizando();
  });
  const devolverTodos = () => {
    if (!pendientes || !conductorId) return;
    const { cola, rechazos } = colaDe(conductorId);
    let n = 0;
    for (const s of pendientes) {
      const accion = accionFinJornada(s.estado);
      if (!accion) continue;
      rechazos.delete(s.id);
      cola.encolar({ idAccion: crypto.randomUUID(), servicioId: s.id, accion, motivo: MOTIVO_FIN_JORNADA });
      n++;
    }
    void drenar(conductorId, true).catch(() => {}); // si no hay red, la cola reintenta
    setDevueltos(n);
    seguirFinalizando();
  };

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
        {r.estado !== "fuera" && <button type="button" disabled={pend} onClick={pulsarFinalizar} className={`${btn} border-2 border-slate-500`}>🏁 Finalizar jornada</button>}
      </div>
      {sinGps && <p role="alert" className="rounded-lg border border-red-500 bg-red-950 p-3 text-sm text-red-100">{sinGps}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {enviado && (
        <p role="status" className="text-sm text-slate-200">{ICONO_GRAVEDAD[enviado]} Hoja de cierre enviada a la central{enviado === "ok" ? ": vehículo listo para mañana." : enviado === "grave" ? ": la central revisará los daños." : ": la central programará el mantenimiento."}</p>
      )}
      {devueltos != null && devueltos > 0 && <p role="status" className="text-sm text-amber-200">🔁 {devueltos === 1 ? "1 servicio devuelto" : `${devueltos} servicios devueltos`} a la central para reasignarlos.</p>}
      {pendientes && (
        <div role="dialog" aria-modal="true" aria-label="Servicios pendientes hoy" className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-t-2xl border border-amber-500 bg-slate-900 p-4 sm:rounded-2xl">
            {!volvere ? (
              <>
                <h2 className="text-xl font-semibold text-amber-200">Te quedan {textoPendientes(pendientes.map((p) => hora(p.fecha_hora_recogida)))}</h2>
                <ul className="space-y-1" data-pendientes-hoy>
                  {pendientes.map((p) => <li key={p.id} className="rounded-lg border border-slate-700 px-3 py-2 text-base"><b className="tabular-nums">{hora(p.fecha_hora_recogida)}</b> · {p.trayecto}</li>)}
                </ul>
                <p className="text-base text-slate-200">¿Vas a volver para hacerlos? Si no, no pueden quedar desatendidos.</p>
                <button type="button" onClick={devolverTodos} className={`${btn} bg-amber-600 text-white`} data-accion="devolver-fin-jornada">No, devolverlos a la central</button>
                <button type="button" onClick={() => setVolvere(true)} className={`${btn} border-2 border-slate-500`}>Sí, volveré para hacerlos</button>
                <button type="button" onClick={() => setPendientes(null)} className="min-h-12 w-full rounded-xl text-slate-400">Cancelar</button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-amber-200">Mejor haz una pausa</h2>
                <p className="text-base text-slate-200">Si vas a volver hoy, usa <b>⏸ Pausa</b> en vez de finalizar: la jornada sigue abierta y la central sabe que harás esos servicios.</p>
                {r.estado === "trabajando" && <button type="button" onClick={() => { setPendientes(null); setVolvere(false); hacer("pausa"); }} className={`${btn} bg-amber-600 text-white`}>⏸ Hacer una pausa</button>}
                <button type="button" onClick={seguirFinalizando} className={`${btn} border-2 border-slate-500`}>Finalizar igualmente</button>
                <button type="button" onClick={() => { setPendientes(null); setVolvere(false); }} className="min-h-12 w-full rounded-xl text-slate-400">Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}
      {gpsApagado && r.estado === "fuera" && <p role="status" className="text-sm text-slate-300">GPS apagado («Fuera de servicio»): ya no se envía tu ubicación.</p>}
      {hoja && cierre && (
        <HojaCierre vehiculos={cierre.vehiculos} vehiculoInicial={cierre.vehiculoInicial} zonasIniciales={acumulado.zonas} incidenciasHoy={acumulado.resumen}
          alCancelar={() => setHoja(false)} alEnviado={(g) => { setHoja(false); setEnviado(g); apagarGps(); router.refresh(); }} />
      )}
    </section>
  );
}
