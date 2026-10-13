import { clienteServidor } from "@/lib/supabase/servidor";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import PanelEnVivo from "@/components/central/PanelEnVivo";
import BotonesDemo from "@/components/central/BotonesDemo";
import type { Servicio } from "@/lib/dominio/tipos";
import AvisosMantenimiento from "@/components/central/AvisosMantenimiento";
import { avisosMantenimiento, type PlanVehiculo } from "@/lib/dominio/mantenimiento";
import { leerModulos } from "@/lib/dominio/modulos";
import { diaMadrid } from "@/lib/dominio/geo";
import { HORAS_ACTIVIDAD, TIPOS_GRAVES, type AlertaHorarioAct, type CierreAct, type ServicioAct } from "@/lib/dominio/actividad";
import EstadoTurnos from "@/components/central/EstadoTurnos";
import { agruparHorarios } from "@/lib/dominio/horarios";
import { sumarDias } from "@/lib/dominio/dias";

export const dynamic = "force-dynamic";

export default async function PanelCentral() {
  const sb = await clienteServidor();
  const desde = new Date(Date.now() - 24 * 3600e3).toISOString();
  const hasta = new Date(Date.now() + 48 * 3600e3).toISOString();
  const hace12h = new Date(Date.now() - HORAS_ACTIVIDAD * 3600e3).toISOString();
  const hoy = diaMadrid(new Date());
  const [ventana, sinVer, pos, perfiles, vehiculos, ajustes, eventos, ev12h, inc, revs, jors, cies, alh, hor, exc] = await Promise.all([
    sb.from("servicios").select("*").eq("es_prueba", false).gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta),
    sb.from("servicios").select("*").eq("es_prueba", false).eq("incidencia_vista", false),
    sb.from("posicion_actual").select("*"),
    sb.from("perfiles").select("id,nombre,telefono,vehiculo_habitual_id").or(FILTRO_CONDUCEN),
    sb.from("vehiculos").select("id,matricula"),
    sb.from("ajustes").select("umbral_sin_senal_min,modulos").eq("id", 1).maybeSingle(),
    sb.from("eventos_servicio").select("id,servicio_id,tipo,motivo,creado_en,actor_id").or(`tipo.eq.rechazado,creado_en.gte.${new Date(Date.now() - 20 * 60_000).toISOString()}`).order("creado_en", { ascending: false }).limit(100),
    // «Actividad en vivo»: últimas 12 h de eventos, incidencias (más las graves sin resolver), checklists y jornadas.
    sb.from("eventos_servicio").select("id,servicio_id,tipo,motivo,creado_en,actor_id").gte("creado_en", hace12h).order("creado_en", { ascending: false }).limit(300),
    sb.from("incidencias").select("id,conductor_id,servicio_id,tipo,descripcion,lat,lng,creado_en,resuelta,zonas")
      .or(`creado_en.gte.${hace12h},and(resuelta.is.false,tipo.in.(${TIPOS_GRAVES.join(",")}))`).order("creado_en", { ascending: false }).limit(100),
    sb.from("checklist_revisiones").select("id,conductor_id,vehiculo_id,con_fallos,observaciones,creado_en").gte("creado_en", hace12h).order("creado_en", { ascending: false }).limit(100),
    sb.from("jornadas").select("id,conductor_id,inicio,fin,pendientes_cierre").or(`inicio.gte.${hace12h},fin.gte.${hace12h}`).order("inicio", { ascending: false }).limit(100),
    // Hojas de cierre: las de las últimas 12 h y las graves sin ver (aunque sean más antiguas).
    sb.from("cierres_jornada").select("id,conductor_id,vehiculo_id,zonas,tecnico,combustible,comentario,gravedad,creado_en,visto")
      .or(`creado_en.gte.${hace12h},and(gravedad.eq.grave,visto.is.false)`).order("creado_en", { ascending: false }).limit(100),
    // Horarios: alertas de las últimas 12 h y turnos de hoy (si las tablas fallan, el panel sigue sin ellos).
    sb.from("alertas_horario").select("id,tipo,conductor_id,servicio_id,texto,creado_en").gte("creado_en", hace12h).order("creado_en", { ascending: false }).limit(100),
    sb.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id").limit(2000),
    sb.from("excepciones_horario").select("conductor_id,fecha,tramos,nota,vehiculo_id,tipo").gte("fecha", sumarDias(hoy, -1)).lte("fecha", sumarDias(hoy, 1)).limit(1000),
  ]);
  const fallo = [ventana, sinVer, pos, perfiles, vehiculos, ajustes, eventos, ev12h, inc, revs, jors, cies].find((r) => r.error);
  const horarios = Object.fromEntries(agruparHorarios(hor.data ?? [], exc.data ?? []));
  if (fallo?.error) throw new Error(`Panel: ${fallo.error.message}`);
  let avisosMant: ReturnType<typeof avisosMantenimiento> = [];
  if (leerModulos(ajustes.data?.modulos).mantenimiento) {
    const [{ data: vk }, { data: planes }] = await Promise.all([sb.from("vehiculos").select("id,matricula,km_actuales"), sb.from("vehiculos_mantenimiento").select("*")]);
    const plan = new Map((planes ?? []).map((p) => [p.vehiculo_id as string, p as PlanVehiculo]));
    avisosMant = avisosMantenimiento((vk ?? []).map((v) => ({ ...v, plan: plan.get(v.id) ?? null })), diaMadrid(new Date()));
  }
  const porId = new Map<string, Servicio>();
  for (const s of [...(ventana.data ?? []), ...(sinVer.data ?? [])] as Servicio[]) porId.set(s.id, s);
  const todosEventos = [...new Map([...(eventos.data ?? []), ...(ev12h.data ?? [])].map((e) => [e.id, e])).values()];
  // Servicios de la actividad fuera de la ventana del panel (p. ej. aceptado hoy para dentro de una semana): solo lo necesario.
  const faltan = [...new Set([...todosEventos.map((e) => e.servicio_id), ...(inc.data ?? []).map((i) => i.servicio_id)])].filter((id): id is string => !!id && !porId.has(id));
  const { data: extra } = faltan.length
    ? await sb.from("servicios").select("id,cliente_nombre,origen_texto,destino_texto,fecha_hora_recogida,conductor_id,origen_pedido,es_prueba").in("id", faltan.slice(0, 200))
    : { data: [] as (ServicioAct & { es_prueba: boolean })[] };
  // Pruebas automáticas: fuera de la actividad, del mapa y de las alertas.
  const ocultos = new Set((extra ?? []).filter((x) => x.es_prueba).map((x) => x.id));
  const eventosVisibles = todosEventos.filter((e) => !ocultos.has(e.servicio_id));
  const incidenciasVisibles = (inc.data ?? []).filter((i) => !i.servicio_id || !ocultos.has(i.servicio_id));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Panel en vivo</h1>
        {process.env.NEXT_PUBLIC_MODO_DEMO === "true" && <BotonesDemo />}
      </div>
      <AvisosMantenimiento avisos={avisosMant} />
      <EstadoTurnos horarios={horarios} conductores={perfiles.data ?? []} />
      <PanelEnVivo
        servicios={[...porId.values()]} posiciones={pos.data ?? []} eventos={eventosVisibles}
        incidencias={incidenciasVisibles} revisiones={revs.data ?? []} alertasHorario={(alh.data ?? []) as AlertaHorarioAct[]} jornadas={jors.data ?? []} cierres={(cies.data ?? []) as CierreAct[]}
        serviciosExtra={(extra ?? []).filter((x) => !x.es_prueba) as ServicioAct[]}
        conductores={perfiles.data ?? []} vehiculos={vehiculos.data ?? []} umbralMin={ajustes.data?.umbral_sin_senal_min ?? 5}
      />
    </div>
  );
}
