"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { colaDe, drenar } from "@/lib/offline/colaConductor";
import { ACCION_SIGUIENTE_CONDUCTOR } from "@/lib/dominio/estados";
import { EVENTO_DISTANCIA, EVENTO_RESALTAR, type DetalleDistancia, type TipoObjetivo } from "@/lib/dominio/navegacion";
import { confirmacionDistancia, DESHACER, formatoCuentaAtras, preguntaDeshacer, restanteDeshacerMs, type EventoPaso, type PasoConductor } from "@/lib/dominio/deshacer";
import type { EstadoServicio } from "@/lib/dominio/tipos";

const SIGUIENTE: Record<PasoConductor, EstadoServicio> = { salir: "en_camino", cargar: "recogido", descargar: "completado" };

/**
 * `ultimoPaso`: último evento de acción del servicio según el servidor (para la cuenta atrás de «Deshacer»).
 * Pasos hechos aquí: se usa la hora local del toque (mismo reloj; algo más prudente que la del servidor).
 */
export default function BotonPaso({ servicioId, conductorId, estadoInicial, siguienteId, ultimoPaso }: {
  servicioId: string; conductorId: string; estadoInicial: EstadoServicio; siguienteId: string | null; ultimoPaso: EventoPaso | null;
}) {
  const router = useRouter();
  const { cola, rechazos, oyentes } = colaDe(conductorId);
  const [estado, setEstado] = useState<EstadoServicio>(estadoInicial);
  const [, forzar] = useState(0);
  const [resaltar, setResaltar] = useState(false);
  const [local, setLocal] = useState<{ estado: EstadoServicio; en: number } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const distancia = useRef<{ tipo: TipoObjetivo; distanciaM: number } | null>(null);
  useEffect(() => {
    const h = (e: Event) => setResaltar(!!(e as CustomEvent<{ activo: boolean }>).detail?.activo);
    const d = (e: Event) => {
      const x = (e as CustomEvent<DetalleDistancia>).detail;
      if (x?.servicioId === servicioId) distancia.current = x.distanciaM == null ? null : { tipo: x.tipo, distanciaM: x.distanciaM };
    };
    window.addEventListener(EVENTO_RESALTAR, h);
    window.addEventListener(EVENTO_DISTANCIA, d);
    return () => { window.removeEventListener(EVENTO_RESALTAR, h); window.removeEventListener(EVENTO_DISTANCIA, d); };
  }, [servicioId]);
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

  // «Deshacer» el último paso: hora local si el paso se hizo aquí; si no, el evento del servidor (si sigue en ese estado).
  const info = DESHACER[estado];
  const ultimo: EventoPaso | null = info && local?.estado === estado
    ? { tipo: info.evento, actor_id: conductorId, creado_en: new Date(local.en).toISOString() }
    : estado === estadoInicial ? ultimoPaso : null;
  const restante = restanteDeshacerMs(estado, ultimo, conductorId, new Date(ahora));
  const yaDeshaciendo = mias().some((p) => p.accion === "deshacer");
  const hayVentana = restante != null && !yaDeshaciendo;
  useEffect(() => {
    if (!hayVentana) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hayVentana]);
  const deshacer = () => {
    const pregunta = preguntaDeshacer(estado);
    if (!info || !pregunta || yaDeshaciendo || !confirm(pregunta)) return;
    rechazos.delete(servicioId);
    cola.encolar({ idAccion: crypto.randomUUID(), servicioId, accion: "deshacer" });
    setLocal(null);
    setEstado(info.hacia); // optimista
    void drenar(conductorId, true).catch(() => {});
  };
  const botonDeshacer = hayVentana && (
    <button type="button" onClick={deshacer} data-accion="deshacer"
      className="min-h-14 w-full rounded-xl border-2 border-amber-400 text-base font-semibold text-amber-200">
      ↩ Deshacer {info?.nombre} (quedan {formatoCuentaAtras(restante)})
    </button>
  );
  const listaErrores = errores.map((e, i) => <p key={i} role="alert" className="text-sm text-red-400">{e}</p>);

  if (estado === "completado") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-xl font-semibold text-emerald-400">¡Servicio terminado!</p>
        <Link href={siguienteId ? `/conductor/servicio/${siguienteId}` : "/conductor"} className="flex min-h-14 items-center justify-center rounded-xl bg-marca text-lg font-semibold text-white">
          {siguienteId ? "Siguiente servicio de hoy" : "Volver a Hoy"}
        </Link>
        {botonDeshacer}
        {pendientes > 0 && <p className="text-sm text-amber-300">⏳ pendiente de enviar ({pendientes})</p>}
        {listaErrores}
      </div>
    );
  }
  const paso = ACCION_SIGUIENTE_CONDUCTOR[estado];
  const pulsar = () => {
    if (!paso || mias().length > 0) return; // un toque a la vez: evita saltarse un paso
    const accion = paso.accion as PasoConductor;
    // ¿Toque sin querer? CARGA/DESCARGA a más de 300 m del objetivo (según el GPS) piden confirmación.
    const aviso = confirmacionDistancia(accion, distancia.current);
    if (aviso && !confirm(aviso)) return;
    rechazos.delete(servicioId);
    cola.encolar({ idAccion: crypto.randomUUID(), servicioId, accion });
    const t = Date.now();
    setLocal({ estado: SIGUIENTE[accion], en: t });
    setAhora(t);
    setEstado(SIGUIENTE[accion]); // optimista
    void drenar(conductorId, true).catch(() => {}); // gesto del usuario: intenta ya
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
      {paso && <button onClick={pulsar} disabled={pendientes > 0} data-resaltado={resaltar || undefined} className={`min-h-16 w-full rounded-xl bg-marca text-lg font-bold text-white disabled:opacity-50 ${resaltar ? "animate-pulse ring-4 ring-green-400 ring-offset-2 ring-offset-slate-950" : ""}`}>{paso.etiqueta}</button>}
      {pendientes > 0 && <p className="text-sm text-amber-300">⏳ pendiente de enviar ({pendientes})</p>}
      {atascada && (
        <button onClick={descartar} className="min-h-12 w-full rounded-xl border border-red-400 text-sm font-semibold text-red-300">
          Descartar (no se pudo enviar tras {atascada.intentos} intentos)
        </button>
      )}
      {botonDeshacer}
      {listaErrores}
    </div>
  );
}
