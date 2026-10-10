"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { accionCentral, marcarIncidenciaVista } from "@/app/central/actions";
import DialogoAsignar from "@/components/central/DialogoAsignar";
import type { Servicio } from "@/lib/dominio/tipos";

export interface EventoAlerta { id: number; servicio_id: string; tipo: string; motivo: string | null; creado_en: string; actor_id?: string | null }

let audioCtx: AudioContext | null = null;
function ctxAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) audioCtx = new Ctx();
  return audioCtx;
}
function pitido() {
  try {
    const ctx = ctxAudio();
    if (!ctx) return;
    void ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio bloqueado: se ignora */ }
}

export function esAlerta(s: Servicio) {
  return !s.incidencia_vista || (s.subcontratar && s.estado === "pendiente");
}

function textoAlerta(s: Servicio, eventos: EventoAlerta[], nombreConductor: (id: string | null) => string) {
  if (s.subcontratar && s.estado === "pendiente") return ["Subcontratar", `Subcontratar (${s.pasajeros} pax)`] as const;
  const inc = s.ultima_incidencia ?? "";
  if (inc.startsWith("rechazado")) {
    const ev = eventos.filter((e) => e.servicio_id === s.id && e.tipo === "rechazado").sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    const motivo = ev?.motivo ?? inc.replace(/^rechazado:\s*/, "");
    return ["Rechazado", `Rechazado por ${nombreConductor(ev?.actor_id ?? s.conductor_id)}: ${motivo}`] as const;
  }
  if (inc === "expirado") return ["Sin respuesta", "Sin respuesta (plazo vencido)"] as const;
  if (inc === "nuevo") return ["Reserva nueva", "Reserva nueva"] as const;
  return ["Aviso", inc || "Incidencia"] as const;
}

export default function ColumnaAlertas({ servicios, eventos, conductores }: {
  servicios: Servicio[]; eventos: EventoAlerta[]; conductores: { id: string; nombre: string }[];
}) {
  const alertas = useMemo(() => servicios.filter(esAlerta).sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida)), [servicios]);
  const nombre = (id: string | null) => conductores.find((c) => c.id === id)?.nombre ?? "conductor";
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activar = () => { try { void ctxAudio()?.resume(); } catch { /* ignorar */ } };
    window.addEventListener("click", activar, { once: true });
    window.addEventListener("keydown", activar, { once: true });
    return () => { window.removeEventListener("click", activar); window.removeEventListener("keydown", activar); };
  }, []);

  const vistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    const claves = new Set(alertas.map((s) => `${s.id}|${s.ultima_incidencia}|${s.incidencia_vista}|${s.subcontratar}`));
    if (vistas.current && [...claves].some((k) => !vistas.current!.has(k))) pitido();
    vistas.current = claves;
  }, [alertas]);

  const subcontratar = (id: string) => ini(async () => {
    setError(null);
    const r = await accionCentral({ idAccion: crypto.randomUUID(), servicioId: id, accion: "subcontratar" });
    if (!r.ok) setError(r.error ?? "No se pudo subcontratar");
  });
  const visto = (id: string) => ini(async () => { await marcarIncidenciaVista(id); });

  return (
    <section aria-label="Alertas" className="space-y-3">
      <h2 className="text-lg font-semibold">Alertas ({alertas.length})</h2>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {alertas.length === 0 && <p className="text-sm text-slate-400">Sin alertas pendientes.</p>}
      {alertas.map((s) => {
        const [tipo, texto] = textoAlerta(s, eventos, nombre);
        return (
          <article key={s.id} data-alerta={tipo} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <p className="text-sm font-medium text-marca-claro">{texto}</p>
            <p className="text-xs text-slate-400">
              {new Date(s.fecha_hora_recogida).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })} · {s.cliente_nombre} · {s.origen_texto} → {s.destino_texto}
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
