import "server-only";
import type { clienteAdmin } from "@/lib/supabase/admin";
import { construirDemo, debeRenovar, MOTIVO_SIMULADO, NOTA_DEMO } from "@/lib/demo/datosDemo";
import { aparcadoEn, posicionDemo, salidaHacia, siguientePasoDemo, tramoDemo, type PasoDemo, type ServicioEnMapa } from "@/lib/demo/movimiento";

/**
 * Demo viva en el servidor: cargar los datos de demo (botón del panel y renovación automática), retirarlos cuando se
 * quedan viejos y hacer «trabajar» a los conductores de demo (sus servicios avanzan y sus coches circulan por
 * carretera). Solo toca filas marcadas con NOTA_DEMO y coches sin GPS real.
 */
type Sb = ReturnType<typeof clienteAdmin>;
/** Un conductor que ha mandado GPS real en la última media hora no se mueve a una posición inventada. */
const GPS_REAL_MS = 30 * 60_000;

async function conGpsReal(sb: Sb, ahora: number): Promise<Set<string>> {
  const { data, error } = await sb.from("posiciones").select("conductor_id").eq("simulada", false).gte("registrado_en", new Date(ahora - GPS_REAL_MS).toISOString());
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.conductor_id as string));
}

async function conductoresDemo(sb: Sb) {
  const { data, error } = await sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").eq("rol", "conductor").order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, vehiculoId: (p.vehiculo_habitual_id as string | null) ?? null }));
}

/** Inserta un escenario de demo relativo a `ahora`. Devuelve cuántos servicios. */
export async function cargarDemo(sb: Sb, ahora = Date.now()): Promise<number> {
  const [conductores, reales] = await Promise.all([conductoresDemo(sb), conGpsReal(sb, ahora)]);
  const demo = construirDemo(new Date(ahora), conductores);
  const { error } = await sb.from("servicios").insert(demo.servicios);
  if (error) throw new Error(error.message);
  const res = await Promise.all([
    sb.from("eventos_servicio").insert(demo.eventos),
    demo.incidencias.length ? sb.from("incidencias").insert(demo.incidencias) : Promise.resolve({ error: null }),
    sb.from("posiciones").insert(demo.posiciones.filter((p) => !reales.has(p.conductor_id))),
  ]);
  for (const r of res) if (r.error) throw new Error(r.error.message);
  return demo.servicios.length;
}

/** Demo ya cargada y a la vista (para no duplicarla). */
export async function demoVisible(sb: Sb, ahora = Date.now()): Promise<number> {
  const { count } = await sb.from("servicios").select("id", { count: "exact", head: true })
    .eq("notas", NOTA_DEMO).eq("es_prueba", false).gte("fecha_hora_recogida", new Date(ahora - 6 * 3600e3).toISOString());
  return count ?? 0;
}

/**
 * Retira de la vista (es_prueba = true, sin borrar nada) la demo cargada hasta `hasta`, y cierra sus avisos e
 * incidencias para que no queden alertas de servicios que ya no se ven. Devuelve los ids retirados: si otra instancia
 * del servidor se adelantó, sale vacío (el update bloquea la fila y vuelve a evaluar el filtro).
 */
async function retirarDemo(sb: Sb, hasta: string): Promise<string[]> {
  const { data, error } = await sb.from("servicios").update({ es_prueba: true })
    .eq("notas", NOTA_DEMO).eq("es_prueba", false).lte("creado_en", hasta).select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length) {
    const ahora = new Date().toISOString();
    await Promise.all([
      sb.from("alertas_horario").update({ resuelta_en: ahora }).in("servicio_id", ids).is("resuelta_en", null),
      sb.from("incidencias").update({ resuelta: true, resuelta_en: ahora }).in("servicio_id", ids).eq("resuelta", false),
    ]);
  }
  return ids;
}

/** Renueva la demo si se ha quedado vieja y nadie la está usando (ver debeRenovar). */
async function renovarSiToca(sb: Sb, ahora: number): Promise<void> {
  const { data: ult, error: e1 } = await sb.from("servicios").select("creado_en").eq("notas", NOTA_DEMO).eq("es_prueba", false)
    .order("creado_en", { ascending: false }).limit(1).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!ult) return;
  const carga = ult.creado_en as string;
  // Acciones de personas (la central o un conductor) sobre la demo después de cargarla; ni los avisos automáticos ni los
  // pasos de la simulación cuentan.
  const { data: acc, error: e2 } = await sb.from("eventos_servicio").select("creado_en,servicios!inner(notas,es_prueba)")
    .eq("servicios.notas", NOTA_DEMO).eq("servicios.es_prueba", false).not("actor_id", "is", null).gt("creado_en", carga)
    .or(`motivo.is.null,motivo.neq.${MOTIVO_SIMULADO}`)
    .order("creado_en", { ascending: false }).limit(1).maybeSingle();
  if (e2) throw new Error(e2.message); // ante la duda, no se renueva
  if (!debeRenovar({ ultimaCarga: Date.parse(carga), ultimaAccion: acc ? Date.parse(acc.creado_en as string) : null, ahora })) return;
  const retirados = await retirarDemo(sb, carga);
  if (!retirados.length) return;
  const n = await cargarDemo(sb, ahora);
  console.log(`[demo] renovada: ${retirados.length} servicios retirados, ${n} nuevos`);
}

const CAMPOS_MAPA = "id,estado,conductor_id,duracion_estimada_min,fecha_hora_recogida,asignado_en,origen_lat,origen_lng,destino_lat,destino_lng";
const ACCIONES = { aceptar: ["aceptado", "aceptado"], salir: ["en_camino", "en_camino"], cargar: ["recogido", "recogido"], descargar: ["completado", "completado"] } as const;

/** Aplica un paso del conductor de demo con la misma transición atómica que la app (si alguien se adelantó, no hace nada). */
async function darPaso(sb: Sb, s: ServicioEnMapa, paso: PasoDemo): Promise<void> {
  if (paso.tipo === "aviso") {
    const { error } = await sb.from("eventos_servicio").insert({ servicio_id: s.id, tipo: paso.evento, actor_id: s.conductor_id, motivo: MOTIVO_SIMULADO });
    if (error) throw new Error(error.message);
    return;
  }
  const [estado, evento] = ACCIONES[paso.accion];
  const { error } = await sb.rpc("transicion_servicio", {
    p_id: s.id, p_esperado: s.estado, p_cambios: paso.accion === "aceptar" ? { estado, incidencia_vista: true } : { estado },
    p_tipo: evento, p_actor: s.conductor_id, p_motivo: MOTIVO_SIMULADO, p_conductor_esperado: s.conductor_id, p_comprobar_conductor: true,
  });
  if (error) throw new Error(error.message);
}

/**
 * Los conductores de demo «trabajan»: cada servicio suyo avanza cuando toca (acepta, sale, avisa, recoge, termina) y su
 * coche circula por carretera; los aparcados se refrescan cada 3 min para que no salgan «sin señal». No se toca a un
 * conductor con GPS real (lo lleva un móvil) y no se le dan pasos a uno que una persona está manejando ahora mismo.
 */
async function simularDemo(sb: Sb, ahora: number, aparcados: boolean): Promise<void> {
  const { data: servs, error } = await sb.from("servicios").select(CAMPOS_MAPA).eq("notas", NOTA_DEMO).eq("es_prueba", false)
    .gte("fecha_hora_recogida", new Date(ahora - 12 * 3600e3).toISOString()).lt("fecha_hora_recogida", new Date(ahora + 36 * 3600e3).toISOString());
  if (error) throw new Error(error.message);
  if (!servs?.length) return; // sin demo cargada no se simula nada
  const lista = servs as ServicioEnMapa[];
  const activos = lista.filter((s) => s.estado === "en_camino" || s.estado === "recogido");
  const [conductores, reales, { data: manos }, { data: evs }] = await Promise.all([
    conductoresDemo(sb), conGpsReal(sb, ahora),
    sb.from("eventos_servicio").select("actor_id").gte("creado_en", new Date(ahora - 30 * 60_000).toISOString())
      .not("actor_id", "is", null).or(`motivo.is.null,motivo.neq.${MOTIVO_SIMULADO}`).limit(500),
    activos.length
      ? sb.from("eventos_servicio").select("servicio_id,tipo,creado_en").in("servicio_id", activos.map((s) => s.id))
        .in("tipo", ["en_camino", "recogido", "llegando_recogida", "llegando_destino"]).order("creado_en")
      : Promise.resolve({ data: [] as { servicio_id: string; tipo: string; creado_en: string }[] }),
  ]);
  const enManos = new Set((manos ?? []).map((m) => m.actor_id as string));
  const ultimo = (id: string, tipo: string) => (evs ?? []).filter((e) => e.servicio_id === id && e.tipo === tipo).at(-1)?.creado_en ?? null;
  const ts = new Date(ahora).toISOString();
  const filas: { conductor_id: string; lat: number; lng: number; velocidad: number; registrado_en: string; simulada: true }[] = [];
  for (const [i, c] of conductores.entries()) {
    if (reales.has(c.id)) continue;
    const suyos = lista.filter((s) => s.conductor_id === c.id);
    const actual = suyos.find((s) => s.estado === "recogido") ?? suyos.find((s) => s.estado === "en_camino") ?? null;
    let tramo = null;
    if (actual) {
      const paso = ultimo(actual.id, actual.estado);
      tramo = tramoDemo(actual, salidaHacia(actual, suyos, i), paso ? Date.parse(paso) : null);
    }
    // Pasos: los de todos sus servicios (uno por servicio y pasada), salvo que lo esté manejando una persona.
    if (!enManos.has(c.id)) {
      for (const s of suyos) {
        const tr = s === actual ? tramo : null;
        const llegando = s.estado === "en_camino" ? "llegando_recogida" : "llegando_destino";
        const desde = ultimo(s.id, s.estado);
        const avisado = (evs ?? []).some((e) => e.servicio_id === s.id && e.tipo === llegando && (!desde || e.creado_en >= desde));
        const paso = siguientePasoDemo(s, tr, avisado, ahora);
        if (paso) await darPaso(sb, s, paso).catch((e) => console.error("[demo] paso:", e instanceof Error ? e.message : e));
      }
    }
    if (!tramo && !aparcados) continue;
    filas.push({ conductor_id: c.id, ...posicionDemo(tramo, aparcadoEn(suyos, i), ahora), registrado_en: ts, simulada: true });
  }
  if (!filas.length) return;
  const { error: e2 } = await sb.from("posiciones").insert(filas); // el trigger actualiza posicion_actual
  if (e2) throw new Error(e2.message);
}

let ultimoMovimiento = 0, ultimoAparcado = 0, ultimaRevision = 0;
/** Pasada del vigilante (cada ~20 s): pasos y coches cada 30 s, aparcados cada 3 min y renovación revisada cada 5 min. */
export async function pasadaDemo(sb: Sb, ahora = Date.now()): Promise<void> {
  if (ahora - ultimaRevision >= 5 * 60_000) {
    ultimaRevision = ahora;
    await renovarSiToca(sb, ahora);
  }
  if (ahora - ultimoMovimiento < 30_000) return;
  ultimoMovimiento = ahora;
  const aparcados = ahora - ultimoAparcado >= 3 * 60_000;
  if (aparcados) ultimoAparcado = ahora;
  await simularDemo(sb, ahora, aparcados);
}
