"use client";
import { useState, useTransition } from "react";
import { guardarNumeroVuelo, guardarLlegadaReal, moverRecogidaPorVuelo, consultarLlegadaAuto } from "@/app/central/vuelos-actions";
import { admiteReajuste, horaMadrid, utcALocalMadrid, urlVuelo } from "@/lib/dominio/vuelos";
import type { EstadoServicio } from "@/lib/dominio/tipos";

type Props = { servicioId: string; estado: EstadoServicio; numeroVuelo: string | null; llegadaReal: string | null; margenMin: number; autoDisponible: boolean };
const campo = "rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-slate-100 focus:border-marca-claro focus:outline-none";
const boton = "rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50";

export default function PanelVuelo({ servicioId, estado, numeroVuelo, llegadaReal, margenMin, autoDisponible }: Props) {
  const [vuelo, setVuelo] = useState(numeroVuelo ?? "");
  const [llegada, setLlegada] = useState(llegadaReal ? utcALocalMadrid(llegadaReal) : "");
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string }>();
  const [pendiente, empezar] = useTransition();
  const editable = admiteReajuste(estado);
  const ejecutar = (f: () => Promise<{ ok: boolean; mensaje: string }>, despues?: (r: Awaited<ReturnType<typeof f>> & { propuesta?: string | null; llegada?: string }) => void) =>
    empezar(async () => { const r = await f(); setAviso({ ok: r.ok, texto: r.mensaje }); if (r.ok) despues?.(r); });

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
      <h2 className="font-semibold text-marca-claro">Vuelo</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label>Nº de vuelo<br />
          <input value={vuelo} onChange={(e) => setVuelo(e.target.value)} maxLength={10} placeholder="FR1234" disabled={!editable} className={`${campo} w-32 uppercase`} /></label>
        {editable && <button type="button" disabled={pendiente} className={boton} onClick={() => ejecutar(() => guardarNumeroVuelo(servicioId, vuelo))}>Guardar vuelo</button>}
        {numeroVuelo && <a href={urlVuelo(numeroVuelo)} target="_blank" rel="noopener noreferrer" className="py-1.5 text-marca-claro hover:underline">Ver vuelo {numeroVuelo} ↗</a>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>Hora real de llegada<br />
          <input type="datetime-local" value={llegada} onChange={(e) => { setLlegada(e.target.value); setPropuesta(null); }} disabled={!editable} className={campo} /></label>
        {editable && <button type="button" disabled={pendiente || !llegada} className={boton}
          onClick={() => ejecutar(() => guardarLlegadaReal(servicioId, llegada), (r) => setPropuesta(r.propuesta ?? null))}>Guardar llegada</button>}
        {editable && autoDisponible && numeroVuelo && <button type="button" disabled={pendiente} className={boton}
          onClick={() => ejecutar(() => consultarLlegadaAuto(servicioId), (r) => r.llegada && setLlegada(r.llegada))}>Consultar automáticamente</button>}
      </div>
      <p className="text-slate-400">La recogida propuesta es la llegada real + {margenMin} min para el equipaje.</p>
      {propuesta && editable && (
        <button type="button" disabled={pendiente} className="rounded-lg bg-marca-claro px-3 py-1.5 font-medium text-slate-950 disabled:opacity-50"
          onClick={() => { if (confirm(`¿Mover la recogida a las ${horaMadrid(propuesta)} y avisar al conductor?`)) ejecutar(() => moverRecogidaPorVuelo(servicioId, propuesta), () => setPropuesta(null)); }}>
          Mover recogida a {horaMadrid(propuesta)}</button>
      )}
      {!editable && <p className="text-slate-500">Servicio cerrado: la hora de recogida ya no se reajusta.</p>}
      {aviso && <p role="status" className={aviso.ok ? "text-emerald-300" : "text-red-400"}>{aviso.texto}</p>}
    </section>
  );
}
