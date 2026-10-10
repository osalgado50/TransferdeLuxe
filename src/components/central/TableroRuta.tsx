"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import EstadoBadge from "@/components/comun/EstadoBadge";
import { accionCentral } from "@/app/central/actions";
import type { EstadoServicio } from "@/lib/dominio/tipos";
import { aPlan, construirCandidatos, deTramo, enAgenda, encaja, finDe, fmtDuracion, fmtHora, planDia, razonTransicion, type Transicion } from "@/lib/dominio/planificacion";
import { sugerirConductores } from "@/lib/dominio/sugerencia";

export type TarjetaRuta = {
  id: string; estado: EstadoServicio; conductor_id: string | null; fecha_hora_recogida: string; origen_texto: string; destino_texto: string;
  pasajeros: number; maletas: number; duracion_estimada_min: number;
  origen_lat: number | null; origen_lng: number | null; destino_lat: number | null; destino_lng: number | null;
};
type Conductor = { id: string; nombre: string; vehiculo_habitual_id: string | null };
type Vehiculo = { id: string; plazas: number; maletas: number; estado: "activo" | "taller" };
type Chip = { conductor: Conductor; texto: string };

const COLOR: Record<Transicion["estado"], string> = {
  ok: "border-green-500/40 bg-green-500/10 text-green-300",
  justo: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  no_llega: "border-red-500/40 bg-red-500/10 text-red-300",
  desconocido: "border-slate-700 bg-slate-900 text-slate-400",
};

function Traslado({ t }: { t: Transicion }) {
  const ruta = `${t.desdeTexto ?? "?"} → ${t.hastaTexto ?? "?"}`;
  return (
    <div className={`break-words rounded-md border px-2 py-1 text-xs ${COLOR[t.estado]}`} data-traslado={t.estado}>
      {t.estado === "desconocido" ? <>🚗 {ruta} · traslado sin estimar</>
        : t.estado === "no_llega" ? <>⚠ {razonTransicion(t)}</>
        : <>🚗 {ruta} · {fmtDuracion(t.trasladoMin!)} · llega {fmtHora(t.llegadaEstimada!)} · {t.margenMin} min de margen</>}
    </div>
  );
}

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const MOVIBLES: EstadoServicio[] = ["pendiente", "asignado", "aceptado"];
const SIN = "sin-asignar";

function Tarjeta({ s, chip, onAsignar }: { s: TarjetaRuta; chip?: Chip | null; onAsignar?: (c: Conductor) => void }) {
  const movible = MOVIBLES.includes(s.estado);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.id, disabled: !movible });
  return (
    <div ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)` } : undefined}
      className={`rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm ${movible ? "" : "opacity-70"} ${isDragging ? "z-10 shadow-lg" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        {movible && <button type="button" aria-label="Arrastrar servicio" {...attributes} {...listeners} className="-m-1 flex min-h-11 min-w-11 cursor-grab touch-none select-none items-center justify-center p-1 text-slate-500">⋮⋮</button>}
        <strong>{hora.format(new Date(s.fecha_hora_recogida))}</strong><EstadoBadge estado={s.estado} />
      </div>
      <p className="mt-1 text-slate-300">{s.origen_texto} → {s.destino_texto}</p>
      <p className="text-xs text-slate-400">
        {fmtHora(new Date(s.fecha_hora_recogida))} → {fmtHora(finDe(aPlan(s)))} · {fmtDuracion(s.duracion_estimada_min)} · {s.pasajeros} pax
      </p>
      {chip && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-marca/10 px-2 py-1 text-xs text-marca-claro">
          <span className="min-w-0 flex-1 break-words">💡 Mejor: {chip.texto}</span>
          {onAsignar && <button type="button" onClick={() => onAsignar(chip.conductor)}
            className="min-h-9 rounded-md border border-marca-claro px-2 font-medium hover:bg-marca-claro hover:text-slate-950">Asignar</button>}
        </div>
      )}
    </div>
  );
}

function Columna({ id, titulo, items, chips, traslados, onAsignar }: {
  id: string; titulo: string; items: TarjetaRuta[]; chips?: Record<string, Chip | null>; traslados?: Record<string, Transicion>;
  onAsignar?: (s: TarjetaRuta, c: Conductor) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`w-64 shrink-0 space-y-2 rounded-xl border p-3 ${isOver ? "border-marca-claro bg-slate-800" : "border-slate-800 bg-slate-950"}`}>
      <h2 className="font-medium text-marca-claro">{titulo} <span className="text-xs text-slate-400">({items.length})</span></h2>
      {items.map((s) => {
        const t = traslados?.[s.id];
        return (
          <div key={s.id} className="space-y-2">
            {t && <Traslado t={t} />}
            <Tarjeta s={s} chip={chips?.[s.id]} onAsignar={onAsignar && MOVIBLES.includes(s.estado) ? (c) => onAsignar(s, c) : undefined} />
          </div>
        );
      })}
      {!items.length && <p className="text-xs text-slate-500">Sin servicios</p>}
    </section>
  );
}

export default function TableroRuta({ servicios, conductores, vehiculos = [], contexto = [] }: {
  servicios: TarjetaRuta[]; conductores: Conductor[]; vehiculos?: Vehiculo[];
  /** Servicios fuera del día mostrado (víspera 18:00 – día siguiente 06:00): solo cuentan para la viabilidad. */
  contexto?: TarjetaRuta[];
}) {
  const [asignacion, setAsignacion] = useState<Record<string, string | null>>({});
  const [pendiente, setPendiente] = useState<{ s: TarjetaRuta; c: Conductor; razon: string } | null>(null);
  const [aviso, setAviso] = useState<{ t: string; error: boolean } | null>(null);
  const [, iniciar] = useTransition();
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  useEffect(() => { setAsignacion({}); setPendiente(null); }, [servicios]);
  useEffect(() => {
    if (!aviso || aviso.error) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  const actual = (s: TarjetaRuta) => (s.id in asignacion ? asignacion[s.id] : s.conductor_id);

  // Agenda «viva» (estados activos; una asignación optimista cuenta como «asignado»), incluido el contexto fuera del día.
  const agenda = [...servicios, ...contexto].flatMap((x) => {
    const cid = actual(x);
    const estado = x.id in asignacion ? "asignado" : x.estado;
    return cid && enAgenda(estado) ? [{ ...x, conductor_id: cid, estado }] : [];
  });
  const agendaDe = (conductorId: string) => agenda.filter((x) => x.conductor_id === conductorId).map(aPlan);
  const traslados: Record<string, Transicion> = {};
  for (const c of conductores) for (const t of planDia(agendaDe(c.id)).transiciones) traslados[t.siguienteId] = t;

  function alSoltar(e: DragEndEvent) {
    if (!e.over) return;
    const s = servicios.find((x) => x.id === e.active.id);
    const destino = String(e.over.id);
    if (!s || destino === (actual(s) ?? SIN)) return;
    if (destino === SIN) { setAviso({ t: "No se puede dejar sin asignar: para quitar el conductor, cancela el servicio o espera un rechazo.", error: true }); return; }
    const c = conductores.find((x) => x.id === destino);
    if (!c) return;
    const r = encaja(aPlan(s), agendaDe(c.id));
    if (!r.encaja) { setPendiente({ s, c, razon: r.razon ?? "No encaja en su agenda" }); return; }
    asignar(s, c);
  }

  function asignar(s: TarjetaRuta, c: Conductor) {
    const destino = c.id;
    const previo = actual(s);
    setAsignacion((a) => ({ ...a, [s.id]: destino }));
    setAviso(null);
    iniciar(async () => {
      const r = await accionCentral({
        idAccion: crypto.randomUUID(), servicioId: s.id, accion: previo ? "reasignar" : "asignar",
        conductorId: destino, vehiculoId: c.vehiculo_habitual_id ?? undefined,
      });
      if (r.ok) setAviso({ t: `Servicio asignado a ${c.nombre}`, error: false });
      else { setAsignacion((a) => ({ ...a, [s.id]: previo })); setAviso({ t: r.error, error: true }); }
    });
  }

  const de = (id: string) => servicios.filter((s) => (actual(s) ?? SIN) === id)
    .sort((a, b) => Date.parse(a.fecha_hora_recogida) - Date.parse(b.fecha_hora_recogida));

  const chips = useMemo(() => {
    const ahora = new Date();
    const res: Record<string, Chip | null> = {};
    const candidatos = construirCandidatos(conductores, vehiculos, agenda);
    for (const s of servicios.filter((x) => !actual(x) && MOVIBLES.includes(x.estado))) {
      const p = aPlan(s);
      const mejor = sugerirConductores({ ...p, pasajeros: s.pasajeros, maletas: s.maletas }, candidatos, ahora).find((x) => x.apto);
      const c = mejor && conductores.find((x) => x.id === mejor.conductorId);
      if (!mejor || !c) { res[s.id] = null; continue; }
      const ant = encaja(p, candidatos.find((x) => x.conductorId === c.id)!.agenda.map(deTramo)).anterior;
      const detalle = ant
        ? [`termina ${fmtHora(ant.finAnterior)}`, mejor.distanciaKm != null ? `a ${mejor.distanciaKm} km` : null].filter(Boolean).join(" ")
          + (ant.margenMin != null ? ` · margen ${ant.margenMin} min` : "")
        : "libre antes de esta recogida";
      res[s.id] = { conductor: c, texto: `${c.nombre} — ${detalle}` };
    }
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, contexto, conductores, vehiculos, asignacion]);

  return (
    <DndContext id="tablero-ruta" sensors={sensores} onDragEnd={alSoltar}>
      {aviso && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${aviso.error ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}>{aviso.t}</p>}
      <div className="flex max-w-full gap-3 overflow-x-auto pb-3">
        <Columna id={SIN} titulo="Sin asignar" items={de(SIN)} chips={chips} onAsignar={asignar} />
        {conductores.map((c) => <Columna key={c.id} id={c.id} titulo={c.nombre} items={de(c.id)} traslados={traslados} />)}
      </div>
      {pendiente && (
        <div role="dialog" aria-modal="true" aria-label="Confirmar asignación" onClick={() => setPendiente(null)}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold text-marca-claro">¿Asignar a {pendiente.c.nombre}?</h2>
            <p className="break-words text-sm text-red-300">⚠ {pendiente.razon}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPendiente(null)} className="min-h-11 rounded-lg border border-slate-600 px-4">Cancelar</button>
              <button type="button" onClick={() => { const p = pendiente; setPendiente(null); asignar(p.s, p.c); }}
                className="min-h-11 rounded-lg bg-red-600 px-4 font-medium text-white hover:bg-red-500">Asignar igualmente</button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
