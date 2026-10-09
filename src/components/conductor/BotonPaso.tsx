"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { colaDe, drenar } from "@/lib/offline/colaConductor";
import { ACCION_SIGUIENTE_CONDUCTOR } from "@/lib/dominio/estados";
import type { EstadoServicio } from "@/lib/dominio/tipos";

const SIGUIENTE: Record<"salir" | "cargar" | "descargar", EstadoServicio> = { salir: "en_camino", cargar: "recogido", descargar: "completado" };

export default function BotonPaso({ servicioId, conductorId, estadoInicial, siguienteId }: { servicioId: string; conductorId: string; estadoInicial: EstadoServicio; siguienteId: string | null }) {
  const router = useRouter();
  const { cola, rechazos, oyentes } = colaDe(conductorId);
  const [estado, setEstado] = useState<EstadoServicio>(estadoInicial);
  const [, forzar] = useState(0);
  const servidor = useRef(estadoInicial);
  servidor.current = estadoInicial;
  const mias = () => cola.pendientes().filter((p) => p.servicioId === servicioId);
  const pendientes = mias().length;
  const atascada = mias().find((p) => (p.intentos ?? 0) >= 3);
  const errores = rechazos.get(servicioId) ?? [];

  // El estado del servidor manda: si no hay nada pendiente, seguirlo siempre.
  useEffect(() => { if (cola.pendientes().every((p) => p.servicioId !== servicioId)) setEstado(estadoInicial); }, [estadoInicial, cola, servicioId]);
  useEffect(() => {
    const f = () => {
      forzar((n) => n + 1);
      if (cola.pendientes().every((p) => p.servicioId !== servicioId)) {
        if (rechazos.has(servicioId)) setEstado(servidor.current); // rechazado: deshacer lo optimista
        router.refresh(); // sincroniza con el servidor
      }
    };
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, [oyentes, cola, rechazos, servicioId, router]);

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
    if (!paso || mias().length > 0) return; // un toque a la vez: evita saltarse un paso
    const accion = paso.accion as "salir" | "cargar" | "descargar";
    rechazos.delete(servicioId);
    cola.encolar({ idAccion: crypto.randomUUID(), servicioId, accion });
    setEstado(SIGUIENTE[accion]); // optimista
    void drenar(conductorId);
  };
  const descartar = () => {
    if (!atascada) return;
    cola.descartar(atascada.idAccion);
    setEstado(servidor.current);
    forzar((n) => n + 1);
    router.refresh();
  };
  return (
    <div className="space-y-2">
      {paso && <button onClick={pulsar} disabled={pendientes > 0} className="min-h-16 w-full rounded-xl bg-amber-400 text-lg font-bold text-slate-950 disabled:opacity-50">{paso.etiqueta}</button>}
      {pendientes > 0 && <p className="text-sm text-amber-300">⏳ pendiente de enviar ({pendientes})</p>}
      {atascada && (
        <button onClick={descartar} className="min-h-12 w-full rounded-xl border border-red-400 text-sm font-semibold text-red-300">
          Descartar (no se pudo enviar tras {atascada.intentos} intentos)
        </button>
      )}
      {errores.map((e, i) => <p key={i} className="text-sm text-red-400">{e}</p>)}
    </div>
  );
}
