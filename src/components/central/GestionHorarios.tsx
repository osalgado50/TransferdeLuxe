"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { borrarExcepcion, borrarPlantilla, guardarExcepcion, guardarPlantilla, guardarSemana, quitarHorario, type Resultado } from "@/app/central/horarios/actions";
import {
  DIAS_SEMANA, MAX_TRAMOS, NOMBRE_DIA, copiarALaborables, esNocturno, minutos, textoTramos, tipoJornada, validarTramos,
  type DiaSemanaHorario, type ExcepcionHorario, type Plantilla, type Tramo,
} from "@/lib/dominio/horarios";

const campo = "min-h-10 rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm";
const boton = "min-h-10 rounded-lg bg-marca px-4 text-sm font-semibold text-white disabled:opacity-50";
const secundario = "min-h-10 rounded-lg border border-slate-600 px-3 text-sm hover:border-marca-claro disabled:opacity-50";
const hora = (m: number) => `${String(Math.floor(Math.min(m, 1440) / 60)).padStart(2, "0")}:${String(Math.min(m, 1440) % 60).padStart(2, "0")}`;

/** Un tramo más: el primero 08:00–15:00; si ya hay, 1 h después del último (4 h, sin pasar de medianoche; tras uno de noche, ninguno). */
function tramoNuevo(ts: Tramo[]): Tramo | null {
  if (!ts.length) return { inicio: "08:00", fin: "15:00" };
  if (ts.some(esNocturno)) return null;
  const ult = minutos(ts[ts.length - 1].fin);
  if (ult + 60 >= 1440) return null;
  return { inicio: hora(ult + 60), fin: hora(Math.min(ult + 300, 1440)) };
}

function Mensaje({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return r.ok ? <p role="status" className="text-sm text-green-300">{r.mensaje}</p> : <p role="alert" className="text-sm text-red-400">{r.error}</p>;
}

/** Editor de tramos (inicio/fin, quitar, + añadir tramo). */
function EditorTramos({ tramos, onChange, etiqueta }: { tramos: Tramo[]; onChange: (t: Tramo[]) => void; etiqueta: string }) {
  const nuevo = tramoNuevo(tramos);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tramos.length === 0 && <span className="text-sm text-slate-400">Libre</span>}
      {tramos.map((t, i) => (
        <span key={i} className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-1.5 py-1">
          <input type="time" step={300} value={t.inicio} aria-label={`${etiqueta}: inicio del tramo ${i + 1}`} className={`${campo} min-h-9 w-[6.5rem]`}
            onChange={(e) => onChange(tramos.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))} />
          <span className="text-slate-500">–</span>
          <input type="time" step={300} value={t.fin === "24:00" ? "23:59" : t.fin} aria-label={`${etiqueta}: fin del tramo ${i + 1}`} className={`${campo} min-h-9 w-[6.5rem]`}
            onChange={(e) => onChange(tramos.map((x, j) => (j === i ? { ...x, fin: e.target.value === "23:59" ? "24:00" : e.target.value } : x)))} />
          {esNocturno(t) && <span className="text-xs text-indigo-300" title="Turno de noche: termina al día siguiente">🌙 +1 día</span>}
          <button type="button" aria-label={`${etiqueta}: quitar el tramo ${i + 1}`} onClick={() => onChange(tramos.filter((_, j) => j !== i))}
            className="flex size-8 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-red-300">×</button>
        </span>
      ))}
      {nuevo && tramos.length < MAX_TRAMOS && (
        <button type="button" onClick={() => onChange([...tramos, nuevo])} className="rounded-lg border border-dashed border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-marca-claro">
          + {tramos.length ? "añadir tramo (partida)" : "añadir tramo"}
        </button>
      )}
    </div>
  );
}

type Vehiculo = { id: string; matricula: string; modelo: string; estado: string };

/** Semana tipo de un conductor: 7 días con tramos, vehículo del turno y plantilla; copiar a laborables; guardar. */
export function EditorSemana({ conductor, semana, plantillas, vehiculos, tieneHorario }: {
  conductor: { id: string; nombre: string; vehiculo_habitual_id: string | null }; semana: DiaSemanaHorario[]; plantillas: Plantilla[];
  vehiculos: Vehiculo[]; tieneHorario: boolean;
}) {
  const router = useRouter();
  const [dias, setDias] = useState<DiaSemanaHorario[]>(() => DIAS_SEMANA.map((d) => {
    const x = semana.find((y) => y.dia_semana === d);
    return { dia_semana: d, tramos: x?.tramos ?? [], vehiculo_id: x?.vehiculo_id ?? null, plantilla_id: x?.plantilla_id ?? null };
  }));
  const [plantillaLab, setPlantillaLab] = useState("");
  const [r, setR] = useState<Resultado | null>(null);
  const [pend, ini] = useTransition();
  const cambiar = (dia: number, c: Partial<DiaSemanaHorario>) => { setR(null); setDias((ds) => ds.map((d) => (d.dia_semana === dia ? { ...d, ...c } : d))); };
  const errores = Object.fromEntries(dias.map((d) => { const v = validarTramos(d.tramos); return [d.dia_semana, v.ok ? null : v.error]; }));
  const hayErrores = Object.values(errores).some(Boolean);
  const aplicarALaborables = () => {
    const p = plantillas.find((x) => x.id === plantillaLab);
    if (!p) return;
    setR(null);
    setDias((ds) => ds.map((d) => (d.dia_semana <= 5 ? { ...d, tramos: p.tramos.map((t) => ({ ...t })), plantilla_id: p.id } : d)));
  };
  const guardar = () => ini(async () => {
    const res = await guardarSemana(conductor.id, dias.map((d) => ({ dia_semana: d.dia_semana, tramos: d.tramos, vehiculo_id: d.vehiculo_id ?? null, plantilla_id: d.plantilla_id ?? null })));
    setR(res);
    if (res.ok) router.refresh();
  });
  const quitar = () => {
    if (!confirm(`¿Quitar el horario de ${conductor.nombre}? Quedará disponible todo el día (como antes).`)) return;
    ini(async () => { const res = await quitarHorario(conductor.id); setR(res); if (res.ok) router.refresh(); });
  };
  const habitual = vehiculos.find((v) => v.id === conductor.vehiculo_habitual_id);
  return (
    <section aria-label={`Semana tipo de ${conductor.nombre}`} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Semana tipo de {conductor.nombre}</h2>
        {!tieneHorario && <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">Sin horario: disponible todo el día</span>}
      </div>
      <p className="text-sm text-slate-400">Jornada continua (un tramo) o partida (dos tramos con un rato para comer). Un día sin tramos es libre. El coche
        sale de la base y vuelve a ella en cada tramo: allí se hace el relevo con el siguiente conductor.</p>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => { setR(null); setDias(copiarALaborables(dias, 1)); }} className={secundario}>Copiar el lunes a todos los laborables</button>
        {plantillas.length > 0 && <>
          <label className="text-sm">Plantilla para L–V<br />
            <select value={plantillaLab} onChange={(e) => setPlantillaLab(e.target.value)} className={campo}>
              <option value="">Elige…</option>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({textoTramos(p.tramos)})</option>)}
            </select></label>
          <button type="button" disabled={!plantillaLab} onClick={aplicarALaborables} className={secundario}>Aplicar a laborables</button>
        </>}
      </div>
      <ul className="divide-y divide-slate-800">
        {dias.map((d) => (
          <li key={d.dia_semana} data-dia-semana={d.dia_semana} className="grid gap-2 py-3 lg:grid-cols-[7rem_1fr_auto] lg:items-center">
            <div><p className="font-medium">{NOMBRE_DIA[d.dia_semana]}</p><p className="text-xs text-slate-400">{tipoJornada(d.tramos)}</p></div>
            <div className="space-y-1">
              <EditorTramos tramos={d.tramos} etiqueta={NOMBRE_DIA[d.dia_semana]} onChange={(t) => cambiar(d.dia_semana, { tramos: t, plantilla_id: null })} />
              {errores[d.dia_semana] && <p role="alert" className="text-xs text-red-400">{errores[d.dia_semana]}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {plantillas.length > 0 && (
                <select aria-label={`${NOMBRE_DIA[d.dia_semana]}: plantilla`} value={d.plantilla_id ?? ""} className={campo}
                  onChange={(e) => { const p = plantillas.find((x) => x.id === e.target.value); cambiar(d.dia_semana, p ? { tramos: p.tramos.map((t) => ({ ...t })), plantilla_id: p.id } : { plantilla_id: null }); }}>
                  <option value="">Plantilla…</option>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              )}
              <select aria-label={`${NOMBRE_DIA[d.dia_semana]}: vehículo del turno`} value={d.vehiculo_id ?? ""} className={campo}
                onChange={(e) => cambiar(d.dia_semana, { vehiculo_id: e.target.value || null })}>
                <option value="">{habitual ? `Habitual (${habitual.matricula})` : "Vehículo habitual"}</option>
                {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}{v.estado === "taller" ? " (taller)" : ""}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pend || hayErrores} onClick={guardar} className={boton}>{pend ? "Guardando…" : "Guardar horario"}</button>
        {tieneHorario && <button type="button" disabled={pend} onClick={quitar} className="min-h-10 rounded-lg border border-red-500 px-3 text-sm text-red-300 disabled:opacity-50">Quitar horario</button>}
        <Mensaje r={r} />
      </div>
    </section>
  );
}

/** Plantillas reutilizables: crear / editar / borrar. */
export function GestionPlantillas({ plantillas }: { plantillas: Plantilla[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<{ id: string | null; nombre: string; tramos: Tramo[] } | null>(null);
  const [r, setR] = useState<Resultado | null>(null);
  const [pend, ini] = useTransition();
  const v = editando ? validarTramos(editando.tramos) : null;
  const guardar = () => editando && ini(async () => {
    const res = await guardarPlantilla(editando);
    setR(res);
    if (res.ok) { setEditando(null); router.refresh(); }
  });
  return (
    <section aria-label="Plantillas de horario" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Plantillas</h2>
        {!editando && <button type="button" onClick={() => { setR(null); setEditando({ id: null, nombre: "", tramos: [{ inicio: "08:00", fin: "13:00" }, { inicio: "16:00", fin: "20:00" }] }); }} className={secundario}>+ Nueva plantilla</button>}
      </div>
      {plantillas.length === 0 && !editando && <p className="text-sm text-slate-400">Sin plantillas. Crea por ejemplo «Mañanas 06–14» o «Partido 08–13 / 16–20» y aplícalas en un clic.</p>}
      <ul className="space-y-2">
        {plantillas.map((p) => (
          <li key={p.id} data-plantilla={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
            <span><b>{p.nombre}</b> · {textoTramos(p.tramos)} <span className="text-slate-400">({tipoJornada(p.tramos).toLowerCase()})</span></span>
            <span className="flex gap-2">
              <button type="button" onClick={() => { setR(null); setEditando({ id: p.id, nombre: p.nombre, tramos: p.tramos }); }} className="rounded border border-slate-600 px-3 py-1">Editar</button>
              <button type="button" disabled={pend} onClick={() => { if (confirm(`¿Borrar la plantilla «${p.nombre}»?`)) ini(async () => { setR(await borrarPlantilla(p.id)); router.refresh(); }); }}
                className="rounded border border-red-500 px-3 py-1 text-red-300 disabled:opacity-50">Borrar</button>
            </span>
          </li>
        ))}
      </ul>
      {editando && (
        <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
          <label className="block text-sm">Nombre<br />
            <input value={editando.nombre} maxLength={60} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Partido 08–13 / 16–20" className={`${campo} w-full max-w-sm`} /></label>
          <EditorTramos tramos={editando.tramos} etiqueta="Plantilla" onChange={(t) => setEditando({ ...editando, tramos: t })} />
          {v && !v.ok && <p role="alert" className="text-xs text-red-400">{v.error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={pend || !v?.ok} onClick={guardar} className={boton}>{editando.id ? "Guardar plantilla" : "Crear plantilla"}</button>
            <button type="button" onClick={() => setEditando(null)} className={secundario}>Cancelar</button>
          </div>
        </div>
      )}
      <Mensaje r={r} />
    </section>
  );
}

/** Cambios de un día concreto (manda sobre la semana tipo): otro horario o libre. */
export function GestionExcepciones({ conductor, excepciones, hoy }: { conductor: { id: string; nombre: string }; excepciones: ExcepcionHorario[]; hoy: string }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(hoy);
  const [tramos, setTramos] = useState<Tramo[]>([{ inicio: "08:00", fin: "15:00" }]);
  const [nota, setNota] = useState("");
  const [r, setR] = useState<Resultado | null>(null);
  const [pend, ini] = useTransition();
  const v = validarTramos(tramos);
  const fmt = (d: string) => new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  return (
    <section aria-label={`Cambios de un día de ${conductor.nombre}`} className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold">Cambios de un día · {conductor.nombre}</h2>
      <p className="text-sm text-slate-400">Para un día concreto (cambio de turno con un compañero, médico…): manda sobre la semana tipo. Sin tramos = libre ese día.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Fecha<br /><input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className={campo} /></label>
        <div className="text-sm">Horario ese día<br /><EditorTramos tramos={tramos} etiqueta="Cambio de un día" onChange={setTramos} /></div>
        <label className="text-sm">Nota (opcional)<br /><input value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder="Cambio con Laia" className={campo} /></label>
        <button type="button" disabled={pend || !v.ok || !fecha} className={boton}
          onClick={() => ini(async () => { const res = await guardarExcepcion({ conductor_id: conductor.id, fecha, tramos, nota }); setR(res); if (res.ok) router.refresh(); })}>
          Guardar cambio
        </button>
      </div>
      {!v.ok && <p role="alert" className="text-xs text-red-400">{v.error}</p>}
      <Mensaje r={r} />
      {excepciones.length === 0 ? <p className="text-sm text-slate-400">Ningún cambio próximo.</p> : (
        <ul className="space-y-2">
          {excepciones.map((e) => (
            <li key={e.fecha} data-excepcion={e.fecha} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
              <span><b className="capitalize">{fmt(e.fecha)}</b> · {textoTramos(e.tramos)}{e.nota ? <span className="text-slate-400"> · {e.nota}</span> : null}</span>
              <button type="button" disabled={pend} onClick={() => ini(async () => { setR(await borrarExcepcion(conductor.id, e.fecha)); router.refresh(); })}
                className="rounded border border-red-500 px-3 py-1 text-red-300 disabled:opacity-50">Borrar</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
