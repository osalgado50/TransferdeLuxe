import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";
import { consumoMedioL100 } from "@/lib/dominio/combustible";
import { agrupar, filtrar, mesMadrid, serviciosPorDia, totales, type FiltroInforme, type ServicioInforme } from "@/lib/dominio/informes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerFiltro(q: Record<string, string | undefined | null>): FiltroInforme {
  return {
    mes: q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) ? q.mes : mesMadrid(new Date().toISOString()),
    conductor: q.conductor && UUID.test(q.conductor) ? q.conductor : undefined,
    vehiculo: q.vehiculo && UUID.test(q.vehiculo) ? q.vehiculo : undefined,
  };
}

export async function moduloInformesActivo(): Promise<boolean> {
  const { data } = await clienteAdmin().from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  return leerModulos(data?.modulos).informes;
}

/** Rango UTC holgado que cubre el mes en hora de Madrid (luego se filtra exacto con mesMadrid). */
function rango(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return { desde: new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString(), hasta: new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString() };
}

export async function cargarInforme(f: FiltroInforme) {
  const sb = clienteAdmin();
  const { desde, hasta } = rango(f.mes);
  const [y, m] = f.mes.split("-").map(Number);
  const finMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [vs, cs, ss, ts, ev, inc] = await Promise.all([
    sb.from("vehiculos").select("id,matricula").order("matricula"),
    sb.from("perfiles").select("id,nombre").eq("rol", "conductor").order("nombre"),
    sb.from("servicios").select("id,estado,pasajeros,conductor_id,vehiculo_id,fecha_hora_recogida,origen_lat,origen_lng,destino_lat,destino_lng")
      .gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta),
    // Todos los tickets hasta fin de mes: el consumo necesita el repostaje anterior como referencia.
    sb.from("tickets_combustible").select("vehiculo_id,conductor_id,fecha,litros,importe,km").lte("fecha", finMes),
    sb.from("eventos_servicio").select("tipo,actor_id,creado_en").eq("tipo", "rechazado").gte("creado_en", desde).lt("creado_en", hasta),
    sb.from("incidencias").select("conductor_id,servicio_id,creado_en").gte("creado_en", desde).lt("creado_en", hasta),
  ]);
  const error = [vs, cs, ss, ts, ev].find((r) => r.error)?.error ?? null; // incidencias es opcional (módulo aparte)
  const servicios = filtrar((ss.data ?? []) as ServicioInforme[], f, (x) => x.fecha_hora_recogida);
  const vehDeServicio = new Map((ss.data ?? []).map((s) => [s.id as string, s.vehiculo_id as string | null]));
  const todosTickets = (ts.data ?? []).map((t) => ({ vehiculoId: t.vehiculo_id as string, vehiculo_id: t.vehiculo_id as string, conductor_id: t.conductor_id as string,
    fecha: t.fecha as string, litros: Number(t.litros), importe: Number(t.importe), km: t.km as number }));
  const tickets = filtrar(todosTickets, f, (x) => x.fecha);
  const rechazos = filtrar((ev.data ?? []).map((e) => ({ conductor_id: e.actor_id as string | null, creado_en: e.creado_en as string })), { ...f, vehiculo: undefined }, (x) => x.creado_en);
  const incidencias = inc.error ? [] : filtrar((inc.data ?? []).map((i) => ({ conductor_id: i.conductor_id as string, vehiculo_id: i.servicio_id ? vehDeServicio.get(i.servicio_id) ?? null : null, creado_en: i.creado_en as string })), f, (x) => x.creado_en);
  const porVehiculo = agrupar({ servicios, tickets, rechazos: [], incidencias }, "vehiculo");
  // Consumo por vehículo con el histórico hasta fin de mes (los tickets previos dan el km de partida).
  for (const fila of porVehiculo) {
    const ts2 = todosTickets.filter((t) => t.vehiculoId === fila.id && (!f.conductor || t.conductor_id === f.conductor));
    const delMes = ts2.filter((t) => mesMadrid(t.fecha) === f.mes);
    if (delMes.length === 0) { fila.l100 = null; continue; }
    const previo = ts2.filter((t) => t.fecha < `${f.mes}-01`).sort((a, b) => b.km - a.km)[0];
    fila.l100 = consumoMedioL100(previo ? [previo, ...delMes] : delMes);
  }
  const porConductor = agrupar({ servicios, tickets, rechazos, incidencias }, "conductor");
  return {
    error, vehiculos: vs.data ?? [], conductores: cs.data ?? [], porVehiculo, porConductor,
    totales: totales(porConductor), porDia: serviciosPorDia(servicios, f.mes),
  };
}
