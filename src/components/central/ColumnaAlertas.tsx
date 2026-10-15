"use client";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { direccionCorta } from "@/lib/dominio/direccion";
import { leerMotivoSubcontratar } from "@/lib/dominio/capacidad";
import { textoDesasignado, textoDevuelto } from "@/lib/dominio/centralMovil";
import { accionCentral, marcarIncidenciaVista } from "@/app/central/actions";
import { etiquetaEvento, llegandoReciente } from "@/lib/dominio/navegacion";
import DialogoAsignar from "@/components/central/DialogoAsignar";
import AlertasModulos from "@/components/central/AlertasModulos";
import type { Servicio } from "@/lib/dominio/tipos";

/** Dirección corta para la columna: «Calle, barrio · Localidad». */
const corta = (t: string) => { const d = direccionCorta(t); return d.localidad ? `${d.principal} · ${d.localidad}` : d.principal; };

export interface EventoAlerta { id: number; servicio_id: string; tipo: string; motivo: string | null; creado_en: string; actor_id?: string | null }

export function esAlerta(s: Servicio) {
  return !s.incidencia_vista || (s.subcontratar && s.estado === "pendiente");
}

function textoAlerta(s: Servicio, eventos: EventoAlerta[], nombreConductor: (id: string | null) => string) {
  if (s.subcontratar && s.estado === "pendiente") {
    const razon = leerMotivoSubcontratar(s.ultima_incidencia);
    return ["Subcontratar", `Subcontratar (${s.pasajeros} pax, ${s.maletas} maletas)${razon ? `: ${razon}` : ""}`] as const;
  }
  const inc = s.ultima_incidencia ?? "";
  if (inc.startsWith("rechazado")) {
    const ev = eventos.filter((e) => e.servicio_id === s.id && e.tipo === "rechazado").sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    const motivo = ev?.motivo ?? inc.replace(/^rechazado:\s*/, "");
    return ["Rechazado", `Rechazado por ${nombreConductor(ev?.actor_id ?? s.conductor_id)}: ${motivo}`] as const;
  }
  if (inc.startsWith("devuelto")) {
    // «No puedo hacer este servicio»: ya no tiene conductor; quién lo devolvió sale del evento «devuelto».
    const ev = eventos.filter((e) => e.servicio_id === s.id && e.tipo === "devuelto").sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    return ["Devuelto", textoDevuelto(s, ev?.actor_id ? nombreConductor(ev.actor_id) : null)] as const;
  }
  if (inc.startsWith("desasignado")) return ["Reasignar", textoDesasignado(s)] as const;
  if (inc === "expirado") return ["Sin respuesta", "Sin respuesta · aún puede aceptarlo; si no, reasígnalo"] as const;
  if (inc === "nuevo") return ["Reserva nueva", "Reserva nueva"] as const;
  return ["Aviso", inc || "Incidencia"] as const;
}

/**
 * `arriba`: lo grave (avería/accidente), fijado arriba del todo. Los sonidos (eventos, incidencias, checklist y la
 * alarma de lo grave) los pone el panel.
 */
export default function ColumnaAlertas({ servicios, eventos, conductores, vehiculos = [], arriba }: {
  servicios: Servicio[]; eventos: EventoAlerta[]; conductores: { id: string; nombre: string }[]; vehiculos?: { id: string; matricula: string }[];
  arriba?: ReactNode;
}) {
  const alertas = useMemo(() => servicios.filter(esAlerta).sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida)), [servicios]);
  const nombre = (id: string | null) => conductores.find((c) => c.id === id)?.nombre ?? "conductor";
  const [pend, ini] = useTransition();
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 60_000); return () => clearInterval(t); }, []);
  const llegando = useMemo(() => servicios.flatMap((s) => {
    const ev = llegandoReciente(eventos, s, ahora);
    return ev ? [{ s, ev }] : [];
  }), [servicios, eventos, ahora]);
  const [error, setError] = useState<string | null>(null);

  const subcontratar = (id: string) => ini(async () => {
    setError(null);
    const r = await accionCentral({ idAccion: crypto.randomUUID(), servicioId: id, accion: "subcontratar" });
    if (!r.ok) setError(r.error ?? "No se pudo subcontratar");
  });
  const visto = (id: string) => ini(async () => { await marcarIncidenciaVista(id); });

  return (
    <section aria-label="Alertas" className="space-y-3">
      <h2 className="text-lg font-semibold">Alertas ({alertas.length})</h2>
      {arriba}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <AlertasModulos conductores={conductores} vehiculos={vehiculos} />
      {llegando.map(({ s, ev }) => (
        <article key={`ll-${s.id}`} data-alerta="Llegando" className="rounded-xl border border-green-600 bg-slate-900 p-3">
          <p className="text-sm font-medium text-green-400">{etiquetaEvento(ev.tipo)} · {nombre(s.conductor_id)}</p>
          <p className="text-xs text-slate-400">
            {new Date(ev.creado_en).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })} · {s.cliente_nombre} · {corta(ev.tipo === "llegando_destino" ? s.destino_texto : s.origen_texto)}
          </p>
        </article>
      ))}
      {alertas.length === 0 && <p className="text-sm text-slate-400">Sin alertas pendientes.</p>}
      {alertas.map((s) => {
        const [tipo, texto] = textoAlerta(s, eventos, nombre);
        return (
          <article key={s.id} data-alerta={tipo} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <p className="text-sm font-medium text-amber-300">{texto}</p>
            <p className="text-xs text-slate-400">
              {new Date(s.fecha_hora_recogida).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })} · {s.cliente_nombre} · {corta(s.origen_texto)} → {corta(s.destino_texto)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {s.estado !== "completado" && s.estado !== "cancelado" && s.estado !== "subcontratado" && <DialogoAsignar servicioId={s.id} reasignar={!!s.conductor_id} />}
              {s.estado !== "subcontratado" && <button type="button" disabled={pend} onClick={() => subcontratar(s.id)} className="rounded-lg border border-orange-500 px-3 py-2 text-sm text-orange-300">Subcontratar</button>}
              <button type="button" disabled={pend} onClick={() => visto(s.id)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Visto</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
