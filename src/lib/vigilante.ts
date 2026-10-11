import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";
import { notificarCentral } from "@/lib/push";
import { esperaBackoff } from "@/lib/dominio/reintento";
import { construirAvisos, type EventoAviso, type IncidenciaAviso, type RevisionAviso, type ServicioAviso } from "@/lib/dominio/avisosCentral";

const LIMITE = 50;

/** Una pasada: lee lo nuevo desde el cursor (vigilante_push), avisa a la central y avanza el cursor. */
export async function vigilarUnaVez(): Promise<number> {
  const sb = clienteAdmin();
  const { data: c, error } = await sb.from("vigilante_push").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`cursor: ${error.message}`); // Supabase caído → el arranque aplica backoff
  if (!c) return 0;
  const [{ data: ev }, { data: inc }, { data: rev }] = await Promise.all([
    sb.from("eventos_servicio").select("id,servicio_id,tipo,actor_id,motivo").gt("id", c.ultimo_evento_id).order("id").limit(LIMITE),
    sb.from("incidencias").select("conductor_id,servicio_id,tipo,descripcion,creado_en").gt("creado_en", c.ultima_incidencia_en).order("creado_en").limit(LIMITE),
    sb.from("checklist_revisiones").select("conductor_id,vehiculo_id,con_fallos,creado_en").gt("creado_en", c.ultima_revision_en).order("creado_en").limit(LIMITE),
  ]);
  const eventos = (ev ?? []) as EventoAviso[];
  const incidencias = (inc ?? []) as (IncidenciaAviso & { creado_en: string })[];
  const revisiones = (rev ?? []) as (RevisionAviso & { con_fallos: boolean; creado_en: string })[];
  if (!eventos.length && !incidencias.length && !revisiones.length) return 0;

  const idsServ = [...new Set([...eventos.map((e) => e.servicio_id), ...incidencias.map((i) => i.servicio_id).filter((x): x is string => !!x)])];
  const idsPers = [...new Set([...eventos.map((e) => e.actor_id), ...incidencias.map((i) => i.conductor_id), ...revisiones.map((r) => r.conductor_id)].filter((x): x is string => !!x))];
  const idsVeh = [...new Set(revisiones.map((r) => r.vehiculo_id))];
  const [{ data: servs }, { data: pers }, { data: vehs }] = await Promise.all([
    idsServ.length ? sb.from("servicios").select("id,origen_texto,destino_texto,fecha_hora_recogida,origen_pedido").in("id", idsServ) : Promise.resolve({ data: [] }),
    idsPers.length ? sb.from("perfiles").select("id,nombre").in("id", idsPers) : Promise.resolve({ data: [] }),
    idsVeh.length ? sb.from("vehiculos").select("id,matricula").in("id", idsVeh) : Promise.resolve({ data: [] }),
  ]);
  const avisos = construirAvisos({
    eventos, incidencias, revisiones: revisiones.filter((r) => r.con_fallos),
    servicios: new Map(((servs ?? []) as ServicioAviso[]).map((s) => [s.id, s])),
    nombres: new Map(((pers ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])),
    matriculas: new Map(((vehs ?? []) as { id: string; matricula: string }[]).map((v) => [v.id, v.matricula])),
  });
  // El cursor avanza antes de enviar: ante un fallo se pierde un aviso, nunca se duplica.
  await sb.from("vigilante_push").update({
    ultimo_evento_id: eventos.at(-1)?.id ?? c.ultimo_evento_id,
    ultima_incidencia_en: incidencias.at(-1)?.creado_en ?? c.ultima_incidencia_en,
    ultima_revision_en: revisiones.at(-1)?.creado_en ?? c.ultima_revision_en,
    actualizado_en: new Date().toISOString(),
  }).eq("id", 1);
  for (const a of avisos) await notificarCentral(a.titulo, a.cuerpo, a.data);
  return avisos.length;
}

/**
 * Arranca el vigilante (una vez por proceso). Cadena de setTimeout en vez de setInterval: la siguiente pasada se
 * programa al TERMINAR la anterior, así que nunca se solapan ni se acumulan. Si falla (Supabase caído), espera con
 * backoff (40 s, 80 s… hasta 5 min) en vez de insistir cada 20 s. Cada consulta tiene tiempo máximo (clienteAdmin).
 */
export function arrancarVigilante(cadaMs = 20_000, pasada: () => Promise<unknown> = vigilarUnaVez): void {
  const g = globalThis as { __vigilantePush?: boolean };
  if (g.__vigilantePush) return;
  g.__vigilantePush = true;
  let fallos = 0;
  const programar = (ms: number) => { setTimeout(correr, ms).unref?.(); };
  const correr = async () => {
    try { await pasada(); fallos = 0; }
    catch (e) { fallos++; console.error(`[vigilante] falló (${fallos} seguidos):`, e instanceof Error ? e.message : e); }
    programar(fallos ? Math.max(cadaMs, esperaBackoff(fallos, { baseMs: cadaMs * 2, topeMs: 5 * 60_000 })) : cadaMs);
  };
  programar(cadaMs);
  console.log("[vigilante] push a la central activo");
}
