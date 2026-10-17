import "server-only";
import type { clienteAdmin } from "@/lib/supabase/admin";
import { calcularRecorrido, necesitaRecalculo, ventanaRecorrido, type EventoRecorrido, type PosicionGps } from "@/lib/dominio/recorrido";

type Admin = ReturnType<typeof clienteAdmin>;
const PAGINA = 1000, MAX_POSICIONES = 30_000, TROZO_IN = 150;

const trozos = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Calcula y guarda (upsert) el recorrido de un servicio completado. Devuelve false si aún no se puede calcular. */
export async function guardarRecorrido(sb: Admin, servicioId: string): Promise<boolean> {
  const [{ data: s, error: es }, { data: ev, error: ee }] = await Promise.all([
    sb.from("servicios").select("id,estado,conductor_id").eq("id", servicioId).maybeSingle(),
    sb.from("eventos_servicio").select("tipo,creado_en,actor_id,motivo").eq("servicio_id", servicioId)
      .in("tipo", ["aceptado", "en_camino", "recogido", "completado"]).order("creado_en"),
  ]);
  if (es || ee) throw new Error(`recorrido ${servicioId}: ${(es ?? ee)!.message}`);
  if (!s || s.estado !== "completado") return false;
  const eventos = (ev ?? []) as (EventoRecorrido & { actor_id: string | null })[];
  const v = ventanaRecorrido(eventos);
  const conductor = s.conductor_id ?? eventos.filter((e) => e.tipo === "completado").at(-1)?.actor_id ?? null;
  if (!v) return false;
  // Paginado: PostgREST devuelve como mucho 1000 filas por petición (un viaje largo con GPS cada 5 s tiene más).
  const posiciones: PosicionGps[] = [];
  for (let desde = 0; conductor && desde < MAX_POSICIONES; desde += PAGINA) {
    const { data, error } = await sb.from("posiciones").select("lat,lng,precision_m,registrado_en").eq("conductor_id", conductor).eq("simulada", false)
      .gte("registrado_en", v.inicio).lte("registrado_en", v.fin).order("registrado_en").range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`posiciones ${servicioId}: ${error.message}`);
    posiciones.push(...((data ?? []) as PosicionGps[]));
    if ((data ?? []).length < PAGINA) break;
  }
  const r = calcularRecorrido(posiciones, eventos);
  if (!r) return false;
  const { error } = await sb.from("recorridos").upsert({
    servicio_id: servicioId, conductor_id: conductor, inicio: r.inicio, fin: r.fin, puntos: r.puntos, corte: r.corte,
    km: r.km, km_con_pasajeros: r.km_con_pasajeros, duracion_min: r.duracion_min, puntos_originales: r.puntos_originales,
    calculado_en: new Date().toISOString(),
  }, { onConflict: "servicio_id" });
  if (error) throw new Error(`guardar recorrido ${servicioId}: ${error.message}`);
  return true;
}

/**
 * Una pasada: servicios completados en las últimas `horas` sin recorrido, con uno de un «completado» anterior (se
 * deshizo y se volvió a completar) o recién completados (refresco por posiciones que llegan tarde). Como mucho `max`
 * por pasada para no cargar el vigilante. Devuelve cuántos calculó y cuántos quedan pendientes.
 */
export async function actualizarRecorridos(sb: Admin, { horas = 48, max = 5, ahora = Date.now() } = {}): Promise<{ calculados: number; pendientes: number }> {
  const { data: comp, error } = await sb.from("eventos_servicio").select("servicio_id,creado_en").eq("tipo", "completado")
    .gte("creado_en", new Date(ahora - horas * 3600e3).toISOString()).order("creado_en", { ascending: false }).limit(2000);
  if (error) throw new Error(`completados: ${error.message}`);
  const ultimo = new Map<string, string>();
  for (const e of comp ?? []) if (!ultimo.has(e.servicio_id)) ultimo.set(e.servicio_id, e.creado_en);
  if (!ultimo.size) return { calculados: 0, pendientes: 0 };

  const guardados = new Map<string, { fin: string; calculado_en: string }>();
  const completados = new Set<string>();
  for (const ids of trozos([...ultimo.keys()], TROZO_IN)) {
    const [{ data: rec, error: er }, { data: ss, error: es }] = await Promise.all([
      sb.from("recorridos").select("servicio_id,fin,calculado_en").in("servicio_id", ids),
      sb.from("servicios").select("id").eq("estado", "completado").in("id", ids),
    ]);
    if (er || es) throw new Error(`recorridos: ${(er ?? es)!.message}`);
    for (const r of rec ?? []) guardados.set(r.servicio_id, r);
    for (const s of ss ?? []) completados.add(s.id);
  }
  const pendientes = [...ultimo].filter(([id, fin]) => completados.has(id) && necesitaRecalculo(fin, guardados.get(id) ?? null, ahora)).map(([id]) => id);
  let calculados = 0;
  for (const id of pendientes.slice(0, max)) {
    try { if (await guardarRecorrido(sb, id)) calculados++; }
    catch (e) { console.error("[recorridos]", e instanceof Error ? e.message : e); }
  }
  return { calculados, pendientes: Math.max(0, pendientes.length - max) };
}
