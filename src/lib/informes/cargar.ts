import "server-only";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";
import { consumoMedioL100 } from "@/lib/dominio/combustible";
import { limitesMes, previosAlMes, ticketsLigeros } from "@/lib/combustible/consultas";
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
  const { inicio, fin } = limitesMes(f.mes);
  const PRUEBA = "PRUEBA AUTOMÁTICA";
  const [vs, cs, ss, ts, ev, inc] = await Promise.all([
    sb.from("vehiculos").select("id,matricula").order("matricula"),
    sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("servicios").select("id,estado,pasajeros,conductor_id,vehiculo_id,fecha_hora_recogida,origen_lat,origen_lng,destino_lat,destino_lng").eq("es_prueba", false)
      .gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta),
    // Tickets válidos del mes (de todos los conductores: el consumo los necesita), leídos por páginas. El repostaje
    // anterior de cada vehículo se pide aparte, solo para los vehículos con tickets en el mes.
    ticketsLigeros(sb, { desde: inicio, hasta: fin, vehiculo: f.vehiculo }),
    // Sin servicios de pruebas automáticas (es_prueba o notas «PRUEBA AUTOMÁTICA…»).
    sb.from("eventos_servicio").select("tipo,actor_id,creado_en,servicios!inner(es_prueba,notas)").eq("tipo", "rechazado").gte("creado_en", desde).lt("creado_en", hasta)
      .eq("servicios.es_prueba", false).or(`notas.is.null,notas.not.like.${PRUEBA}*`, { referencedTable: "servicios" }),
    // Ídem; las incidencias sin servicio cuentan, salvo las de descripción «PRUEBA AUTOMÁTICA…».
    sb.from("incidencias").select("conductor_id,servicio_id,creado_en,servicios(es_prueba,notas)").gte("creado_en", desde).lt("creado_en", hasta)
      .not("descripcion", "like", `${PRUEBA}%`)
      .eq("servicios.es_prueba", false).or(`notas.is.null,notas.not.like.${PRUEBA}*`, { referencedTable: "servicios" })
      .or("servicio_id.is.null,servicios.not.is.null"),
  ]);
  const error = [vs, cs, ss, ts, ev].find((r) => r.error)?.error ?? null; // incidencias es opcional (módulo aparte)
  const servicios = filtrar((ss.data ?? []) as ServicioInforme[], f, (x) => x.fecha_hora_recogida);
  const vehDeServicio = new Map((ss.data ?? []).map((s) => [s.id as string, s.vehiculo_id as string | null]));
  const todosTickets = ts.data.map((t) => ({ ...t, vehiculoId: t.vehiculo_id }));
  const tickets = filtrar(todosTickets, f, (x) => x.fecha);
  const rechazos = filtrar((ev.data ?? []).map((e) => ({ conductor_id: e.actor_id as string | null, creado_en: e.creado_en as string })), { ...f, vehiculo: undefined }, (x) => x.creado_en);
  const incidencias = inc.error ? [] : filtrar((inc.data ?? []).map((i) => ({ conductor_id: i.conductor_id as string, vehiculo_id: i.servicio_id ? vehDeServicio.get(i.servicio_id) ?? null : null, creado_en: i.creado_en as string })), f, (x) => x.creado_en);
  const porVehiculo = agrupar({ servicios, tickets, rechazos: [], incidencias }, "vehiculo");
  // Consumo por vehículo: tramos que acaban en un ticket del mes (y del conductor, si se filtra); el de partida es el
  // último ticket por fecha anterior al mes, no el de más km.
  const conTickets = [...new Set(tickets.map((t) => t.vehiculo_id))];
  const previos = await previosAlMes(sb, conTickets, f.mes);
  for (const fila of porVehiculo) {
    const delVeh = todosTickets.filter((t) => t.vehiculo_id === fila.id);
    if (!tickets.some((t) => t.vehiculo_id === fila.id)) { fila.l100 = null; continue; }
    fila.l100 = consumoMedioL100([...previos.filter((p) => p.vehiculo_id === fila.id), ...delVeh],
      (h) => h.fecha.slice(0, 7) === f.mes && (!f.conductor || h.conductor_id === f.conductor));
  }
  const porConductor = agrupar({ servicios, tickets, rechazos, incidencias }, "conductor");
  return {
    error, vehiculos: vs.data ?? [], conductores: cs.data ?? [], porVehiculo, porConductor,
    totales: totales(porConductor), porDia: serviciosPorDia(servicios, f.mes),
  };
}
