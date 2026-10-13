"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrarAusencia, devolverParaReasignar, guardarAusencia, type ResultadoAusencia } from "@/app/central/ausencias/actions";
import { FRANJAS_AUSENCIA, NOMBRE_FRANJA, NOMBRE_TIPO_AUSENCIA, TIPOS_AUSENCIA, textoAusencia, type Ausencia } from "@/lib/dominio/ausencias";

const campo = "min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm";
const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const mayus = (t: string) => t[0].toUpperCase() + t.slice(1);

/** Alta / edición de una ausencia y, al guardar, los servicios que caen dentro con «Devolver para reasignar». */
export function FormAusencia({ conductores, editar, hoy }: {
  conductores: { id: string; nombre: string }[]; editar: (Ausencia & { id: string }) | null; hoy: string;
}) {
  const [estado, accion, guardando] = useActionState<ResultadoAusencia | null, FormData>(guardarAusencia, null);
  const [lote] = useState(() => crypto.randomUUID());
  const [hecho, setHecho] = useState<string | null>(null);
  const [pend, ini] = useTransition();
  const router = useRouter();
  const [desde, setDesde] = useState(editar?.desde ?? hoy);
  const [hasta, setHasta] = useState(editar?.hasta ?? hoy);

  const devolver = (ids: string[], motivo: string) => ini(async () => {
    const r = await devolverParaReasignar({ lote, servicioIds: ids, motivo });
    setHecho(r.errores.length ? `Devueltos ${r.hechos}. No se pudo con ${r.errores.length}: ${r.errores[0]}` : `${r.hechos === 1 ? "Servicio devuelto" : `${r.hechos} servicios devueltos`} a «Sin asignar»: reasígnalos desde el panel.`);
    router.refresh();
  });

  return (
    <section aria-label={editar ? "Editar ausencia" : "Nueva ausencia"} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">{editar ? "Editar ausencia" : "Nueva ausencia"}</h2>
      <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {editar && <input type="hidden" name="id" value={editar.id} />}
        <label className="text-sm">Conductor<br />
          <select name="conductor_id" required defaultValue={editar?.conductor_id ?? ""} className={`${campo} w-full`}>
            <option value="" disabled>Elige…</option>
            {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
        <label className="text-sm">Tipo<br />
          <select name="tipo" required defaultValue={editar?.tipo ?? "vacaciones"} className={`${campo} w-full`}>
            {TIPOS_AUSENCIA.map((t) => <option key={t} value={t}>{mayus(NOMBRE_TIPO_AUSENCIA[t])}</option>)}
          </select></label>
        <label className="text-sm">Franja<br />
          <select name="franja" defaultValue={editar?.franja ?? "dia"} className={`${campo} w-full`}>
            {FRANJAS_AUSENCIA.map((f) => <option key={f} value={f}>{f === "dia" ? "Todo el día" : `Solo ${NOMBRE_FRANJA[f]}${f === "manana" ? " (antes de las 14:00)" : " (desde las 14:00)"}`}</option>)}
          </select></label>
        <label className="text-sm">Desde<br />
          <input name="desde" type="date" required value={desde} onChange={(e) => { setDesde(e.target.value); if (e.target.value > hasta) setHasta(e.target.value); }} className={`${campo} w-full`} /></label>
        <label className="text-sm">Hasta (incluido)<br />
          <input name="hasta" type="date" required min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${campo} w-full`} /></label>
        <label className="text-sm">Nota (opcional)<br />
          <input name="nota" maxLength={300} defaultValue={editar?.nota ?? ""} placeholder="p. ej. Fiesta local" className={`${campo} w-full`} /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button disabled={guardando} className="min-h-11 rounded-lg bg-marca px-4 text-sm font-semibold text-white disabled:opacity-50">{guardando ? "Guardando…" : editar ? "Guardar cambios" : "Guardar ausencia"}</button>
          {editar && <a href="/central/ausencias" className="flex min-h-11 items-center rounded-lg border border-slate-600 px-4 text-sm">Cancelar edición</a>}
        </div>
      </form>
      {estado && !estado.ok && <p role="alert" className="text-sm text-red-400">{estado.error}</p>}
      {estado?.ok && (
        <div role="status" className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm">
          <p className="font-medium text-green-300">{estado.mensaje}</p>
          {estado.afectados.length === 0 ? <p className="text-slate-400">{estado.conductor} no tiene servicios asignados en esas fechas.</p> : (
            <>
              <p className="text-amber-200">{estado.conductor} tiene {estado.afectados.length === 1 ? "1 servicio asignado" : `${estado.afectados.length} servicios asignados`} en esas fechas:</p>
              <ul className="space-y-1" data-afectados>
                {estado.afectados.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-2 py-1">
                    <span><b className="tabular-nums">{fmt.format(new Date(s.fecha_hora_recogida))}</b> · {s.trayecto} · <span className="text-slate-400">{s.estado}</span></span>
                    <button type="button" disabled={pend} onClick={() => devolver([s.id], estado.motivo)} className="rounded border border-amber-500 px-2 py-1 text-xs text-amber-200 disabled:opacity-50">Devolver para reasignar</button>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={pend} onClick={() => devolver(estado.afectados.map((s) => s.id), estado.motivo)}
                className="min-h-11 rounded-lg bg-amber-600 px-4 font-semibold text-white disabled:opacity-50">{pend ? "Devolviendo…" : `Devolver ${estado.afectados.length === 1 ? "el servicio" : `los ${estado.afectados.length}`} para reasignar`}</button>
            </>
          )}
          {hecho && <p className="text-slate-200">{hecho}</p>}
        </div>
      )}
    </section>
  );
}

/** Lista de ausencias (próximas y en curso) con Editar / Borrar. */
export function ListaAusencias({ ausencias, nombres }: { ausencias: (Ausencia & { id: string })[]; nombres: Record<string, string> }) {
  const [pend, ini] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const orden = useMemo(() => [...ausencias].sort((a, b) => a.desde.localeCompare(b.desde)), [ausencias]);
  if (!orden.length) return <p className="text-sm text-slate-400">No hay ausencias próximas.</p>;
  return (
    <>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <ul className="space-y-2">
        {orden.map((a) => (
          <li key={a.id} data-ausencia={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
            <span><b>{nombres[a.conductor_id] ?? "Conductor"}</b> · {textoAusencia(a)}{a.nota ? <span className="text-slate-400"> · {a.nota}</span> : null}</span>
            <span className="flex gap-2">
              <a href={`/central/ausencias?editar=${a.id}`} className="rounded border border-slate-600 px-3 py-1.5">Editar</a>
              <button type="button" disabled={pend} onClick={() => { if (confirm("¿Borrar esta ausencia?")) ini(async () => { const r = await borrarAusencia(a.id); if (!r.ok) setError(r.error ?? "Error"); router.refresh(); }); }}
                className="rounded border border-red-500 px-3 py-1.5 text-red-300 disabled:opacity-50">Borrar</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
