"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { accionConductor } from "@/app/conductor/actions";
import { ColaAcciones, type AccionPendiente } from "@/lib/offline/cola";
import { ACCION_SIGUIENTE_CONDUCTOR } from "@/lib/dominio/estados";
import type { EstadoServicio } from "@/lib/dominio/tipos";

const CLAVE = "tdl-cola";
const almacen = {
  get: () => { try { return localStorage.getItem(CLAVE); } catch { return null; } },
  set: (v: string) => { try { localStorage.setItem(CLAVE, v); } catch { /* sin almacenamiento */ } },
};
const SIGUIENTE: Record<"salir" | "cargar" | "descargar", EstadoServicio> = { salir: "en_camino", cargar: "recogido", descargar: "completado" };

export default function BotonPaso({ servicioId, estadoInicial, siguienteId }: { servicioId: string; estadoInicial: EstadoServicio; siguienteId: string | null }) {
  const [estado, setEstado] = useState<EstadoServicio>(estadoInicial);
  const [pendientes, setPendientes] = useState(0);
  const [errores, setErrores] = useState<string[]>([]);
  const cola = useMemo(() => new ColaAcciones(almacen, async (a: AccionPendiente) => {
    const r = await accionConductor({ idAccion: a.idAccion, servicioId: a.servicioId, accion: a.accion });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }), []);

  const vaciar = useCallback(async () => {
    const r = await cola.vaciar();
    setPendientes(cola.pendientes().length);
    if (r.errores.length) setErrores((e) => [...e, ...r.errores]);
  }, [cola]);

  useEffect(() => {
    setPendientes(cola.pendientes().length);
    void vaciar();
    const alVolver = () => void vaciar();
    window.addEventListener("online", alVolver);
    const t = setInterval(() => void vaciar(), 20000);
    return () => { window.removeEventListener("online", alVolver); clearInterval(t); };
  }, [cola, vaciar]);

  if (estado === "completado") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-xl font-semibold text-emerald-400">¡Servicio terminado!</p>
        <Link href={siguienteId ? `/conductor/servicio/${siguienteId}` : "/conductor"} className="flex min-h-14 items-center justify-center rounded-xl bg-amber-400 text-lg font-semibold text-slate-950">
          {siguienteId ? "Siguiente servicio de hoy" : "Volver a Hoy"}
        </Link>
        {pendientes > 0 && <p className="text-sm text-amber-300">⏳ pendiente de enviar ({pendientes})</p>}
      </div>
    );
  }
  const paso = ACCION_SIGUIENTE_CONDUCTOR[estado];
  const pulsar = () => {
    if (!paso) return;
    const accion = paso.accion as "salir" | "cargar" | "descargar";
    cola.encolar({ idAccion: crypto.randomUUID(), servicioId, accion });
    setEstado(SIGUIENTE[accion]); // optimista
    setErrores([]);
    setPendientes(cola.pendientes().length);
    void vaciar();
  };
  return (
    <div className="space-y-2">
      {paso && <button onClick={pulsar} className="min-h-16 w-full rounded-xl bg-amber-400 text-lg font-bold text-slate-950">{paso.etiqueta}</button>}
      {pendientes > 0 && <p className="text-sm text-amber-300">⏳ pendiente de enviar ({pendientes})</p>}
      {errores.map((e, i) => <p key={i} className="text-sm text-red-400">{e}</p>)}
    </div>
  );
}
