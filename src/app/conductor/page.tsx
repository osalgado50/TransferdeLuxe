import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import ListaProximos from "@/components/conductor/ListaProximos";
import ListaHoy, { type ServicioHoy } from "@/components/conductor/ListaHoy";
import ModulosConductor from "@/components/conductor/ModulosConductor";
import DevolverRapido from "@/components/conductor/DevolverRapido";
import { devolviblesEnBloque } from "@/lib/dominio/estados";

export default async function Hoy() {
  const yo = await exigirConductor();
  const dia = diaMadrid(new Date());
  const desde = madridAUtc(dia, "00:00");
  const hasta = madridAUtc(new Date(Date.parse(`${dia}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10), "00:00");
  const sb = await clienteServidor();
  const { data, error } = await sb.from("servicios")
    .select("id,estado,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas").eq("es_prueba", false)
    .eq("conductor_id", yo.id).gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta)
    .neq("estado", "cancelado").order("fecha_hora_recogida");
  const dia8 = new Date(Date.parse(`${dia}T12:00:00Z`) + 8 * 86400e3).toISOString().slice(0, 10);
  const hasta7 = madridAUtc(dia8, "00:00");
  const { data: prox, error: errorProx } = await sb.from("servicios")
    .select("id,estado,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas").eq("es_prueba", false)
    .eq("conductor_id", yo.id).gte("fecha_hora_recogida", hasta).lt("fecha_hora_recogida", hasta7)
    .not("estado", "in", "(cancelado,completado)").order("fecha_hora_recogida");
  // Sin terminar de días anteriores (hasta 2 semanas): antes no se veían y podían dejar la app enganchada.
  const { data: antes } = await sb.from("servicios")
    .select("id,estado,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas").eq("es_prueba", false)
    .eq("conductor_id", yo.id).gte("fecha_hora_recogida", new Date(Date.parse(desde) - 14 * 86400e3).toISOString()).lt("fecha_hora_recogida", desde)
    .in("estado", ["asignado", "aceptado", "en_camino", "recogido"]).order("fecha_hora_recogida");
  const enBloque = devolviblesEnBloque([antes ?? [], data ?? [], prox ?? []]).map((s) => ({ id: s.id, estado: s.estado }));
  return (
    <div className="space-y-4">
      <ModulosConductor yo={yo} />
      {(antes ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-amber-300">De días anteriores, sin terminar</h2>
          <p className="text-sm text-slate-400">Termínalos o devuélvelos a la central con la ✕.</p>
          <ListaProximos iniciales={(antes ?? []) as ServicioHoy[]} yo={yo.id} desde={new Date(Date.parse(desde) - 14 * 86400e3).toISOString()} hasta={desde}
            vacio="Ya no queda ninguno pendiente." />
        </section>
      )}
      <h1 className="text-2xl font-semibold text-marca-claro">Hoy</h1>
      {error ? <p className="text-red-400">Error al cargar: {error.message}</p>
        : <ListaHoy iniciales={(data ?? []) as ServicioHoy[]} yo={yo.id} desde={desde} hasta={hasta} />}
      <h2 className="pt-4 text-xl font-semibold text-marca-claro">Próximos días</h2>
      {errorProx ? <p className="text-red-400">Error al cargar: {errorProx.message}</p>
        : <ListaProximos iniciales={(prox ?? []) as ServicioHoy[]} yo={yo.id} desde={hasta} hasta={hasta7} />}
      {/* Cuando se acumulan: todos de vuelta a la central para que los redistribuya (con el cliente a bordo, no). */}
      <DevolverRapido conductorId={yo.id} servicios={enBloque} enBloque />
    </div>
  );
}
