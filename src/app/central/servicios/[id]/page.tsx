import Link from "next/link";
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import EstadoBadge from "@/components/comun/EstadoBadge";
import MapaTrayecto from "@/components/mapa/MapaTrayectoCarga";
import AccionesFicha, { MarcarVista } from "@/components/central/AccionesFicha";
import type { Servicio } from "@/lib/dominio/tipos";

const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });
const punto = (lat: number | null, lng: number | null) => (lat != null && lng != null ? { lat, lng } : null);

export default async function FichaServicio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await clienteServidor();
  const { data } = await sb.from("servicios").select("*, conductor:perfiles!servicios_conductor_id_fkey(nombre), vehiculo:vehiculos(matricula,modelo)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const s = data as Servicio & { conductor: { nombre: string } | null; vehiculo: { matricula: string; modelo: string } | null };
  const { data: eventos } = await sb.from("eventos_servicio").select("id,tipo,motivo,creado_en,actor:perfiles(nombre)").eq("servicio_id", id).order("creado_en");
  const sinVer = !!s.ultima_incidencia && !s.incidencia_vista;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {sinVer && <MarcarVista servicioId={s.id} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-marca-claro">Servicio · {fmt.format(new Date(s.fecha_hora_recogida))}</h1>
        <EstadoBadge estado={s.estado} />
      </div>
      {s.ultima_incidencia && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">Incidencia: {s.ultima_incidencia}</p>}
      <AccionesFicha servicioId={s.id} estado={s.estado} />
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm sm:grid-cols-2">
        <div><h2 className="mb-1 font-semibold text-marca-claro">Cliente</h2>
          <p>{s.cliente_nombre} {s.cliente_apellidos}</p><p>{s.cliente_email}</p><p>{s.cliente_telefono}</p></div>
        <div><h2 className="mb-1 font-semibold text-marca-claro">Trayecto</h2>
          <p>Recogida: {s.origen_texto}</p><p>Destino: {s.destino_texto}</p>
          <p>{s.pasajeros} pax · {s.maletas} maletas · {s.tipo_vehiculo_pedido}</p>
          {s.numero_vuelo && <p>Vuelo: {s.numero_vuelo}</p>}{s.notas && <p>Notas: {s.notas}</p>}
          <p>Origen: {s.origen_pedido}</p></div>
        <div><h2 className="mb-1 font-semibold text-marca-claro">Asignación</h2>
          <p>Conductor: <span data-testid="conductor-asignado">{s.conductor?.nombre ?? "Sin asignar"}</span></p>
          {s.vehiculo && <p>Vehículo: {s.vehiculo.modelo} ({s.vehiculo.matricula})</p>}</div>
        {s.servicio_vuelta_id && <div><Link href={`/central/servicios/${s.servicio_vuelta_id}`} className="text-marca-claro hover:underline">Ver vuelta/ida</Link></div>}
      </section>
      <MapaTrayecto origen={punto(s.origen_lat, s.origen_lng)} destino={punto(s.destino_lat, s.destino_lng)} />
      <section>
        <h2 className="mb-2 font-semibold text-marca-claro">Historial</h2>
        <ul className="space-y-1 text-sm">
          {(eventos ?? []).map((e) => {
            const actor = (e.actor as unknown as { nombre: string } | null)?.nombre;
            return <li key={e.id} className="text-slate-300">{fmt.format(new Date(e.creado_en))} · <b>{e.tipo}</b>{actor && ` · ${actor}`}{e.motivo && ` · ${e.motivo}`}</li>;
          })}
          {!eventos?.length && <li className="text-slate-500">Sin eventos.</li>}
        </ul>
      </section>
    </div>
  );
}
