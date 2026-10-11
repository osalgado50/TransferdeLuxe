import { clienteServidor } from "@/lib/supabase/servidor";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import PanelEnVivo from "@/components/central/PanelEnVivo";
import BotonesDemo from "@/components/central/BotonesDemo";
import type { Servicio } from "@/lib/dominio/tipos";
import AvisosMantenimiento from "@/components/central/AvisosMantenimiento";
import { avisosMantenimiento, type PlanVehiculo } from "@/lib/dominio/mantenimiento";
import { leerModulos } from "@/lib/dominio/modulos";
import { diaMadrid } from "@/lib/dominio/geo";
import { HORAS_ACTIVIDAD, TIPOS_GRAVES, type ServicioAct } from "@/lib/dominio/actividad";

export const dynamic = "force-dynamic";

export default async function PanelCentral() {
  const sb = await clienteServidor();
  const desde = new Date(Date.now() - 24 * 3600e3).toISOString();
  const hasta = new Date(Date.now() + 48 * 3600e3).toISOString();
  const hace12h = new Date(Date.now() - HORAS_ACTIVIDAD * 3600e3).toISOString();
  const [ventana, sinVer, pos, perfiles, vehiculos, ajustes, eventos, ev12h, inc, revs, jors] = await Promise.all([
    sb.from("servicios").select("*").gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta),
    sb.from("servicios").select("*").eq("incidencia_vista", false),
    sb.from("posicion_actual").select("*"),
    sb.from("perfiles").select("id,nombre,telefono,vehiculo_habitual_id").or(FILTRO_CONDUCEN),
    sb.from("vehiculos").select("id,matricula"),
    sb.from("ajustes").select("umbral_sin_senal_min,modulos").eq("id", 1).maybeSingle(),
    sb.from("eventos_servicio").select("id,servicio_id,tipo,motivo,creado_en,actor_id").or(`tipo.eq.rechazado,creado_en.gte.${new Date(Date.now() - 20 * 60_000).toISOString()}`).order("creado_en", { ascending: false }).limit(100),
    // «Actividad en vivo»: últimas 12 h de eventos, incidencias (más las graves sin resolver), checklists y jornadas.
    sb.from("eventos_servicio").select("id,servicio_id,tipo,motivo,creado_en,actor_id").gte("creado_en", hace12h).order("creado_en", { ascending: false }).limit(300),
    sb.from("incidencias").select("id,conductor_id,servicio_id,tipo,descripcion,lat,lng,creado_en,resuelta")
      .or(`creado_en.gte.${hace12h},and(resuelta.is.false,tipo.in.(${TIPOS_GRAVES.join(",")}))`).order("creado_en", { ascending: false }).limit(100),
    sb.from("checklist_revisiones").select("id,conductor_id,vehiculo_id,con_fallos,observaciones,creado_en").gte("creado_en", hace12h).order("creado_en", { ascending: false }).limit(100),
    sb.from("jornadas").select("id,conductor_id,inicio,fin").or(`inicio.gte.${hace12h},fin.gte.${hace12h}`).order("inicio", { ascending: false }).limit(100),
  ]);
  const fallo = [ventana, sinVer, pos, perfiles, vehiculos, ajustes, eventos, ev12h, inc, revs, jors].find((r) => r.error);
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
    ? await sb.from("servicios").select("id,cliente_nombre,origen_texto,destino_texto,fecha_hora_recogida,conductor_id,origen_pedido").in("id", faltan.slice(0, 200))
    : { data: [] as ServicioAct[] };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Panel en vivo</h1>
        {process.env.NEXT_PUBLIC_MODO_DEMO === "true" && <BotonesDemo />}
      </div>
      <AvisosMantenimiento avisos={avisosMant} />
      <PanelEnVivo
        servicios={[...porId.values()]} posiciones={pos.data ?? []} eventos={todosEventos}
        incidencias={inc.data ?? []} revisiones={revs.data ?? []} jornadas={jors.data ?? []} serviciosExtra={(extra ?? []) as ServicioAct[]}
        conductores={perfiles.data ?? []} vehiculos={vehiculos.data ?? []} umbralMin={ajustes.data?.umbral_sin_senal_min ?? 5}
      />
    </div>
  );
}
