import Link from "next/link";
import { notFound } from "next/navigation";
import { clienteAdmin } from "@/lib/supabase/admin";
import AvisoCliente from "@/components/comun/AvisoCliente";
import DevolverServicio, { ServicioDevueltoPanel } from "@/components/conductor/DevolverServicio";
import { avisosDisponibles } from "@/lib/dominio/avisoCliente";
import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import EstadoBadge from "@/components/comun/EstadoBadge";
import MapaTrayecto from "@/components/mapa/MapaTrayectoCarga";
import BotonPaso from "@/components/conductor/BotonPaso";
import NavegacionConductor from "@/components/conductor/NavegacionConductor";
import BotonIncidencia from "@/components/conductor/BotonIncidencia";
import ContadorPuntualidad from "@/components/conductor/ContadorPuntualidad";
import EnlaceVuelo from "@/components/vuelos/EnlaceVuelo";
import { leerModulos } from "@/lib/dominio/modulos";
import { objetivoActual } from "@/lib/dominio/navegacion";
import { ultimoEventoAccion, type EventoPaso } from "@/lib/dominio/deshacer";
import type { EstadoServicio, Punto } from "@/lib/dominio/tipos";
import RefrescoPeriodico from "@/components/conductor/RefrescoPeriodico";

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

export default async function ServicioEnCurso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await exigirConductor();
  const sb = await clienteServidor();
  const { data: s } = await sb.from("servicios").select("*").eq("id", id).eq("conductor_id", yo.id).maybeSingle();
  if (!s) {
    // ¿Lo acaba de devolver él («No puedo hacer este servicio»)? Ya no es suyo, pero puede avisar al cliente del cambio.
    const admin = clienteAdmin();
    const { data: dev } = /^[0-9a-f-]{36}$/i.test(id)
      ? await admin.from("eventos_servicio").select("actor_id,creado_en").eq("servicio_id", id).eq("tipo", "devuelto").order("creado_en", { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    if (!dev || dev.actor_id !== yo.id || Date.now() - Date.parse(dev.creado_en) > 6 * 3600_000) {
      // ¿Lo llevaba él y la central se lo ha quitado (pasado a otro, quitado o subcontratado)? Se le dice claramente en vez
      // de un 404 (la página se refresca sola mientras está abierta). Solo si tuvo el servicio: un id ajeno sigue siendo 404.
      const { data: suyo } = /^[0-9a-f-]{36}$/i.test(id)
        ? await admin.from("eventos_servicio").select("id").eq("servicio_id", id).eq("actor_id", yo.id).limit(1).maybeSingle()
        : { data: null };
      if (!suyo) notFound();
      return (
        <div className="space-y-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-5">
          <h1 className="text-xl font-semibold text-amber-200">Este servicio ya no está asignado a ti</h1>
          <p className="text-slate-200">La central lo ha pasado a otro conductor o lo ha retirado. No hace falta que hagas nada más con él.</p>
          <Link href="/conductor" className="inline-flex min-h-12 items-center rounded-xl bg-marca px-5 font-semibold text-white">Volver a Hoy</Link>
        </div>
      );
    }
    const { data: d } = await admin.from("servicios").select("estado,fecha_hora_recogida,cliente_nombre,cliente_telefono").eq("id", id).maybeSingle();
    if (!d) notFound();
    return <ServicioDevueltoPanel servicioId={id} estado={d.estado} telefono={d.cliente_telefono} cliente={d.cliente_nombre} recogida={d.fecha_hora_recogida} conductorNombre={yo.nombre} />;
  }

  const dia = diaMadrid(new Date());
  const desde = madridAUtc(dia, "00:00");
  const hasta = madridAUtc(new Date(Date.parse(`${dia}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10), "00:00");
  // En paralelo (antes, una tras otra: ~100 ms de red cada una). El último paso según el servidor alimenta la cuenta
  // atrás de «↩ Deshacer» (10 min) también tras recargar la página.
  const [{ data: hoy }, { data: aj }, { data: evs }] = await Promise.all([
    sb.from("servicios").select("id,estado,fecha_hora_recogida")
      .eq("conductor_id", yo.id).gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta)
      .neq("estado", "cancelado").neq("estado", "completado").neq("id", id).order("fecha_hora_recogida"),
    sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle(),
    sb.from("eventos_servicio").select("id,tipo,actor_id,creado_en").eq("servicio_id", id)
      .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(30),
  ]);
  const siguienteId = hoy?.[0]?.id ?? null;
  const ultimoPaso = ultimoEventoAccion((evs ?? []) as EventoPaso[]);
  const incidencias = leerModulos(aj?.modulos).incidencias;
  const vuelos = leerModulos(aj?.modulos).vuelos;

  const pt = (lat: number | null, lng: number | null): Punto | null => (lat != null && lng != null ? { lat, lng } : null);
  const origen = pt(s.origen_lat, s.origen_lng);
  const destino = pt(s.destino_lat, s.destino_lng);
  const recogido = s.estado === "recogido" || s.estado === "completado";
  const meta = recogido ? destino : origen;
  const objetivo = objetivoActual(s.estado as EstadoServicio, s);
  const nombre = `${s.cliente_nombre} ${s.cliente_apellidos ?? ""}`.trim();

  return (
    <div className="space-y-4">
      {/* Abierto: se entera si la central lo pasa a otro, lo cambia o lo cancela (Realtime no se lo trae si deja de ser suyo). */}
      {s.estado !== "completado" && s.estado !== "cancelado" && <RefrescoPeriodico segundos={20} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-marca-claro">{hora.format(new Date(s.fecha_hora_recogida))}</h1>
        <EstadoBadge estado={s.estado as EstadoServicio} />
      </div>
      <ContadorPuntualidad servicioId={s.id} estado={s.estado} recogida={s.fecha_hora_recogida} />
      {/* Controles primero: el conductor va conduciendo y necesita los botones a mano, sin hacer scroll. */}
      <BotonPaso servicioId={s.id} conductorId={yo.id} estadoInicial={s.estado as EstadoServicio} siguienteId={siguienteId} ultimoPaso={ultimoPaso} />
      {s.cliente_telefono && s.estado !== "completado" && (
        <a className="flex min-h-16 items-center justify-center rounded-xl border-2 border-slate-500 text-lg font-semibold" href={`tel:${s.cliente_telefono}`}>📞 Llamar al cliente</a>
      )}
      <AvisoCliente servicioId={s.id} estado={s.estado} recogida={s.fecha_hora_recogida} telefono={s.cliente_telefono} cliente={s.cliente_nombre}
        tipos={avisosDisponibles(s.estado)} modo="conductor" conductorNombre={yo.nombre} />
      {incidencias && s.estado !== "completado" && <BotonIncidencia servicioId={s.id} />}
      <DevolverServicio servicioId={s.id} conductorId={yo.id} estado={s.estado} telefono={s.cliente_telefono} cliente={s.cliente_nombre}
        recogida={s.fecha_hora_recogida} conductorNombre={yo.nombre} />
      <div className="space-y-1 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <p><span className="text-slate-400">Recogida:</span> {s.origen_texto}</p>
        <p><span className="text-slate-400">Destino:</span> {s.destino_texto}</p>
        <p><span className="text-slate-400">Cliente:</span> {nombre} · {s.pasajeros} pax · {s.maletas} maletas</p>
        {vuelos && s.numero_vuelo && <p><span className="text-slate-400">Vuelo:</span> {s.numero_vuelo} · <EnlaceVuelo codigo={s.numero_vuelo} /></p>}
      </div>
      {objetivo
        ? <NavegacionConductor key={`${s.id}-${objetivo.tipo}`} servicioId={s.id} objetivo={objetivo} origenServicio={origen} />
        : <MapaTrayecto origen={origen} destino={destino} />}
      <div className="grid grid-cols-2 gap-3 text-center font-semibold">
        {meta && <a className="flex min-h-12 items-center justify-center rounded-xl border border-slate-600 py-3" href={`https://www.google.com/maps/dir/?api=1&destination=${meta.lat},${meta.lng}`} target="_blank" rel="noreferrer">Abrir en Google Maps</a>}
        {meta && <a className="flex min-h-12 items-center justify-center rounded-xl border border-slate-600 py-3" href={`https://waze.com/ul?ll=${meta.lat},${meta.lng}&navigate=yes`} target="_blank" rel="noreferrer">Abrir en Waze</a>}
      </div>
    </div>
  );
}
