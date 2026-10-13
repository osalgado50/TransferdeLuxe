"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { copiarMes, guardarPlan, quitarPlan, repetirSemanas, type Resultado } from "@/app/central/horarios/actions";
import { textoTramos, validarTramos, type Plantilla, type Tramo } from "@/lib/dominio/horarios";
import { diasDelMes, mesesEntre, mesSiguiente, nombreMes } from "@/lib/dominio/planHorarios";
import { sumarDias } from "@/lib/dominio/dias";
import BarraTurno from "./BarraTurno";
import { EditorTramos, Mensaje } from "./GestionHorarios";

/** Un día de un conductor en la vista de mes (calculado en el servidor). */
export interface CeldaMes {
  /** null = sin horario (disponible todo el día). */
  tramos: Tramo[] | null; pintar: Tramo[] | null; fuente: "plan" | "excepcion" | "semanal" | null;
  vehiculoId: string | null; nota: string | null; ausencia: string | null;
}
type Vehiculo = { id: string; matricula: string; modelo: string; estado: string };

const campo = "min-h-10 rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm";
const boton = "min-h-10 rounded-lg bg-marca px-4 text-sm font-semibold text-white disabled:opacity-50";
const secundario = "min-h-10 rounded-lg border border-slate-600 px-3 text-sm hover:border-marca-claro disabled:opacity-50";
const fmtLargo = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fmtCorto = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fecha = (d: string) => new Date(`${d}T12:00:00Z`);
const INICIAL = ["D", "L", "M", "X", "J", "V", "S"];
/** «06–14», «08–13·16–20», «22–06» (horas en punto sin «:00»). */
const corto = (ts: Tramo[]) => ts.map((t) => `${t.inicio.replace(":00", "")}–${t.fin.replace(":00", "")}`).join("·");

/**
 * Planificación del mes: conductores × días con lo que toca cada día (semana tipo, planificado 📅 o cambio puntual ✎).
 * Un clic en un día lo edita solo para esa fecha. Copiar el mes a los siguientes (mismo día de la semana), repetir un
 * bloque de semanas (rotaciones) y quitar lo planificado del mes.
 */
export default function PlanMes({ mes, dias, hoy, conductores, celdas, vehiculos, plantillas, solapes }: {
  mes: string; dias: string[]; hoy: string; conductores: { id: string; nombre: string }[];
  celdas: Record<string, Record<string, CeldaMes>>; vehiculos: Vehiculo[]; plantillas: Plantilla[];
  solapes: { fecha: string; texto: string }[];
}) {
  const router = useRouter();
  const [pend, ini] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);
  const [marcados, setMarcados] = useState<string[]>(conductores.map((c) => c.id));
  const [hasta, setHasta] = useState(mesSiguiente(mes));
  const lunesDelMes = dias.filter((d) => fecha(d).getUTCDay() === 1);
  const [lunesRep, setLunesRep] = useState(lunesDelMes[0] ?? dias[0]);
  const [semanasRep, setSemanasRep] = useState(1);
  const [hastaRep, setHastaRep] = useState(() => diasDelMes(mesesEntre(mes, "9999-12")[3]).at(-1)!); // fin del mes +3
  const [sel, setSel] = useState<{ c: string; d: string } | null>(null);
  const [edit, setEdit] = useState<{ tramos: Tramo[]; vehiculo_id: string | null } | null>(null);

  const hecho = (res: Resultado) => { setR(res); if (res.ok) router.refresh(); };
  const lista = conductores.filter((c) => marcados.includes(c.id));
  const quien = lista.length === conductores.length ? "todos los conductores" : lista.map((c) => c.nombre).join(", ");
  const elegir = (c: string, d: string) => {
    const x = celdas[c]?.[d];
    setR(null);
    setSel({ c, d });
    setEdit({ tramos: (x?.tramos ?? []).map((t) => ({ ...t })), vehiculo_id: x?.fuente === "plan" ? x.vehiculoId : null });
  };
  const v = edit ? validarTramos(edit.tramos) : null;
  const celdaSel = sel ? celdas[sel.c]?.[sel.d] : null;
  const nombreSel = sel ? conductores.find((c) => c.id === sel.c)?.nombre : "";

  const copiar = () => {
    if (!lista.length) return;
    if (!confirm(`¿Copiar ${nombreMes(mes)} hasta ${nombreMes(hasta)} para ${quien}?\n\nCada día toma el mismo día de la semana del mes anterior. Sustituye lo planificado en esos meses; los cambios puntuales (✎) se respetan.`)) return;
    ini(async () => hecho(await copiarMes(lista.map((c) => c.id), mes, hasta)));
  };
  const repetir = () => {
    if (!lista.length) return;
    const fin = sumarDias(lunesRep, semanasRep * 7 - 1);
    if (!confirm(`¿Repetir ${semanasRep === 1 ? "la semana" : `las ${semanasRep} semanas`} del ${fmtCorto.format(fecha(lunesRep))} al ${fmtCorto.format(fecha(fin))} hasta el ${fmtCorto.format(fecha(hastaRep))} para ${quien}?`)) return;
    ini(async () => hecho(await repetirSemanas(lista.map((c) => c.id), lunesRep, semanasRep, hastaRep)));
  };
  const quitarMes = () => {
    if (!lista.length || !confirm(`¿Quitar lo planificado en ${nombreMes(mes)} para ${quien}? Esos días vuelven a la semana tipo (los cambios puntuales se quedan).`)) return;
    ini(async () => hecho(await quitarPlan(lista.map((c) => c.id), dias[0], dias[dias.length - 1])));
  };

  return (
    <section aria-label={`Planificación de ${nombreMes(mes)}`} className="space-y-3">
      <p className="text-xs text-slate-400">Verde: en turno · rayado: fuera de turno · 📅 planificado para ese día · ✎ cambio puntual · sin marca: sale de la
        semana tipo · «—»: sin horario (disponible). Pulsa un día para cambiarlo solo en esa fecha.</p>

      {solapes.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-100" data-solapes-mes={solapes.length}>
          <p className="font-semibold">⚠ Vehículo compartido a la vez este mes</p>
          <ul className="list-disc pl-5">{solapes.slice(0, 8).map((s, i) => <li key={i}>{s.texto}</li>)}</ul>
          {solapes.length > 8 && <p>…y {solapes.length - 8} más.</p>}
        </div>
      )}

      <div className="max-w-full overflow-x-auto rounded-lg border border-slate-800">
        <table className="border-collapse text-[10px]" data-mes={mes}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-slate-900 px-2 py-1 text-left text-xs font-medium">Conductor</th>
              {dias.map((d) => {
                const dow = fecha(d).getUTCDay();
                return (
                  <th key={d} scope="col" className={`min-w-[2.9rem] px-0.5 py-1 text-center font-normal ${d === hoy ? "text-marca-claro" : dow === 0 || dow === 6 ? "text-amber-200/80" : "text-slate-300"} ${dow === 1 ? "border-l border-slate-600" : ""}`}>
                    {INICIAL[dow]}<br />{Number(d.slice(8))}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {conductores.map((c) => (
              <tr key={c.id} className="border-t border-slate-800" data-fila-mes={c.id}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-slate-900 px-2 py-1 text-left text-xs font-medium">{c.nombre}</th>
                {dias.map((d) => {
                  const x = celdas[c.id]?.[d];
                  const activo = sel?.c === c.id && sel.d === d;
                  const lineas = !x || x.tramos == null ? ["—"] : x.tramos.length ? x.tramos.map((t) => corto([t])) : ["Libre"];
                  return (
                    <td key={d} className={`p-0 align-top ${fecha(d).getUTCDay() === 1 ? "border-l border-slate-600" : "border-l border-slate-800"}`}>
                      <button type="button" onClick={() => elegir(c.id, d)} data-dia-mes={d} data-fuente={x?.fuente ?? "sin"}
                        aria-label={`${c.nombre}, ${fmtLargo.format(fecha(d))}: ${x?.tramos ? textoTramos(x.tramos) : "sin horario"}${x?.fuente === "plan" ? " (planificado)" : x?.fuente === "excepcion" ? " (cambio puntual)" : ""}`}
                        className={`block w-full space-y-0.5 px-0.5 py-1 text-left hover:bg-slate-800 ${activo ? "bg-marca/30 ring-1 ring-marca-claro" : d === hoy ? "bg-slate-900/60" : ""} ${d < hoy ? "opacity-60" : ""}`}>
                        <BarraTurno tramos={x?.tramos ?? null} pintar={x?.pintar ?? null} texto={false} />
                        <span className={`block leading-tight ${x?.tramos?.length ? "text-slate-200" : "text-slate-500"}`}>
                          {x?.fuente === "plan" && <span className="block text-sky-300">📅</span>}
                          {x?.fuente === "excepcion" && <span className="block text-sky-300">✎</span>}
                          {lineas.map((l, i) => <span key={i} className="block whitespace-nowrap">{l}</span>)}
                        </span>
                        {x?.ausencia && <span className="block truncate text-amber-200" title={x.ausencia}>{x.ausencia}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && edit && (
        <div className="space-y-2 rounded-xl border border-marca-claro/60 bg-slate-900 p-4" aria-label="Editar un día">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold"><span className="inline-block first-letter:uppercase">{fmtLargo.format(fecha(sel.d))}</span> · {nombreSel}</h3>
            <span className="text-xs text-slate-400">
              Ahora: {celdaSel?.tramos ? textoTramos(celdaSel.tramos) : "sin horario"}
              {celdaSel?.fuente === "plan" ? " (planificado)" : celdaSel?.fuente === "excepcion" ? ` (cambio puntual${celdaSel.nota ? ` · ${celdaSel.nota}` : ""})` : celdaSel?.fuente === "semanal" ? " (semana tipo)" : ""}
            </span>
          </div>
          <EditorTramos tramos={edit.tramos} etiqueta="Ese día" onChange={(t) => setEdit({ ...edit, tramos: t })} />
          <div className="flex flex-wrap items-end gap-2">
            {plantillas.length > 0 && (
              <select aria-label="Plantilla para ese día" value="" className={campo}
                onChange={(e) => { const p = plantillas.find((x) => x.id === e.target.value); if (p) setEdit({ ...edit, tramos: p.tramos.map((t) => ({ ...t })) }); }}>
                <option value="">Plantilla…</option>
                {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({textoTramos(p.tramos)})</option>)}
              </select>
            )}
            <select aria-label="Vehículo del turno ese día" value={edit.vehiculo_id ?? ""} className={campo} onChange={(e) => setEdit({ ...edit, vehiculo_id: e.target.value || null })}>
              <option value="">Vehículo de su semana tipo / habitual</option>
              {vehiculos.map((x) => <option key={x.id} value={x.id}>{x.matricula} · {x.modelo}{x.estado === "taller" ? " (taller)" : ""}</option>)}
            </select>
          </div>
          {v && !v.ok && <p role="alert" className="text-xs text-red-400">{v.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pend || !v?.ok} className={boton}
              onClick={() => ini(async () => hecho(await guardarPlan(sel.c, [{ fecha: sel.d, tramos: edit.tramos, vehiculo_id: edit.vehiculo_id }])))}>
              Guardar este día
            </button>
            <button type="button" disabled={pend} className={secundario} onClick={() => setEdit({ ...edit, tramos: [] })}>Libre ese día</button>
            {celdaSel?.fuente === "plan" && (
              <button type="button" disabled={pend} className="min-h-10 rounded-lg border border-red-500 px-3 text-sm text-red-300 disabled:opacity-50"
                onClick={() => ini(async () => hecho(await quitarPlan([sel.c], sel.d, sel.d)))}>Volver a la semana tipo</button>
            )}
            <button type="button" className={secundario} onClick={() => { setSel(null); setEdit(null); }}>Cerrar</button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h3 className="font-semibold">Planificar varios meses</h3>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-slate-400">Conductores</legend>
          {conductores.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={marcados.includes(c.id)} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))} />
              {c.nombre}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Copiar {nombreMes(mes)} hasta<br />
            <select value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} aria-label="Copiar hasta el mes">
              {mesesEntre(mesSiguiente(mes), mesesEntre(mes, "9999-12")[12]).map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
          </label>
          <button type="button" disabled={pend || !lista.length} onClick={copiar} className={boton}>
            {hasta === mesSiguiente(mes) ? "Copiar al mes siguiente" : "Copiar a los meses siguientes"}
          </button>
        </div>
        <p className="text-xs text-slate-400">Cada día toma el mismo día de la semana del mes anterior (el lunes, del lunes…). Para todo el año, elige diciembre.</p>
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-800 pt-3">
          <label className="text-sm">Repetir desde la semana del<br />
            <select value={lunesRep} onChange={(e) => setLunesRep(e.target.value)} className={campo}>
              {lunesDelMes.map((l) => <option key={l} value={l}>{fmtCorto.format(fecha(l))}</option>)}
            </select>
          </label>
          <label className="text-sm">Bloque de<br />
            <select value={semanasRep} onChange={(e) => setSemanasRep(Number(e.target.value))} className={campo}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} semana{n > 1 ? "s" : ""}</option>)}
            </select>
          </label>
          <label className="text-sm">hasta el<br />
            <input type="date" value={hastaRep} min={sumarDias(lunesRep, semanasRep * 7)} onChange={(e) => setHastaRep(e.target.value)} className={campo} />
          </label>
          <button type="button" disabled={pend || !lista.length || !lunesRep || !hastaRep} onClick={repetir} className={boton}>Repetir</button>
        </div>
        <p className="text-xs text-slate-400">Turnos rotativos: con un bloque de 2 semanas (una de mañanas y otra de tardes) se alternan hasta la fecha que elijas.</p>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <button type="button" disabled={pend || !lista.length} onClick={quitarMes} className="min-h-10 rounded-lg border border-red-500 px-3 text-sm text-red-300 disabled:opacity-50">
            Quitar lo planificado en {nombreMes(mes)}
          </button>
          {pend && <span role="status" className="text-sm text-slate-300">Guardando…</span>}
        </div>
        <Mensaje r={r} />
      </div>
    </section>
  );
}
