"use client";
import { useEffect, useState, useTransition } from "react";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import EstadoBadge from "@/components/comun/EstadoBadge";
import { accionCentral } from "@/app/central/actions";
import type { EstadoServicio } from "@/lib/dominio/tipos";

export type TarjetaRuta = { id: string; estado: EstadoServicio; conductor_id: string | null; fecha_hora_recogida: string; origen_texto: string; destino_texto: string; pasajeros: number };
type Conductor = { id: string; nombre: string; vehiculo_habitual_id: string | null };

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const MOVIBLES: EstadoServicio[] = ["pendiente", "asignado", "aceptado"];
const SIN = "sin-asignar";

function Tarjeta({ s }: { s: TarjetaRuta }) {
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
      <p className="text-xs text-slate-400">{s.pasajeros} pax</p>
    </div>
  );
}

function Columna({ id, titulo, items }: { id: string; titulo: string; items: TarjetaRuta[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`w-64 shrink-0 space-y-2 rounded-xl border p-3 ${isOver ? "border-marca-claro bg-slate-800" : "border-slate-800 bg-slate-950"}`}>
      <h2 className="font-medium text-marca-claro">{titulo} <span className="text-xs text-slate-400">({items.length})</span></h2>
      {items.map((s) => <Tarjeta key={s.id} s={s} />)}
      {!items.length && <p className="text-xs text-slate-500">Sin servicios</p>}
    </section>
  );
}

export default function TableroRuta({ servicios, conductores }: { servicios: TarjetaRuta[]; conductores: Conductor[] }) {
  const [asignacion, setAsignacion] = useState<Record<string, string | null>>({});
  const [aviso, setAviso] = useState<{ t: string; error: boolean } | null>(null);
  const [, iniciar] = useTransition();
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  useEffect(() => { setAsignacion({}); }, [servicios]);
  useEffect(() => {
    if (!aviso || aviso.error) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  const actual = (s: TarjetaRuta) => (s.id in asignacion ? asignacion[s.id] : s.conductor_id);

  function alSoltar(e: DragEndEvent) {
    if (!e.over) return;
    const s = servicios.find((x) => x.id === e.active.id);
    const destino = String(e.over.id);
    if (!s || destino === (actual(s) ?? SIN)) return;
    if (destino === SIN) { setAviso({ t: "No se puede dejar sin asignar: para quitar el conductor, cancela el servicio o espera un rechazo.", error: true }); return; }
    const c = conductores.find((x) => x.id === destino);
    if (!c) return;
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

  const de = (id: string) => servicios.filter((s) => (actual(s) ?? SIN) === id);
  return (
    <DndContext sensors={sensores} onDragEnd={alSoltar}>
      {aviso && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${aviso.error ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}>{aviso.t}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        <Columna id={SIN} titulo="Sin asignar" items={de(SIN)} />
        {conductores.map((c) => <Columna key={c.id} id={c.id} titulo={c.nombre} items={de(c.id)} />)}
      </div>
    </DndContext>
  );
}
