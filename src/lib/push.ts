import "server-only";
import { camposSonidoPush } from "@/lib/dominio/sonidoPush";
import { clienteAdmin } from "@/lib/supabase/admin";
import { mensajesCentral, type MensajeCentral } from "@/lib/dominio/lotePush";

const URL_EXPO = "https://exp.host/--/api/v2/push/send";
const URL_RECIBOS = "https://exp.host/--/api/v2/push/getReceipts";
const LOTE = 100; // máximo de Expo por petición
type Sb = ReturnType<typeof clienteAdmin>;
type Resultado = { status: string; id?: string; details?: { error?: string } };

export function trocear<T>(xs: T[], n = LOTE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Envía en lotes de 100; guarda los tickets para revisar recibos y borra los tokens ya caducados. */
async function enviarExpo(sb: Sb, mensajes: { to: string }[]): Promise<void> {
  for (const lote of trocear(mensajes)) {
    const res = await fetch(URL_EXPO, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(lote), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) { console.error("[push] Expo respondió", res.status); continue; }
    const json = (await res.json().catch(() => null)) as { data?: Resultado[] } | null;
    const datos = json?.data ?? [];
    const caducados = datos.map((t, i) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? lote[i]?.to : null)).filter((t): t is string => !!t);
    if (caducados.length) await sb.from("dispositivos_push").delete().in("token", caducados);
    const tickets = datos.map((t, i) => (t.status === "ok" && t.id && lote[i] ? { ticket_id: t.id, token: lote[i].to } : null)).filter((t): t is { ticket_id: string; token: string } => !!t);
    if (tickets.length) await sb.from("push_tickets").upsert(tickets, { onConflict: "ticket_id" });
  }
}

/** Consulta los recibos de Expo de los tickets pendientes y borra los tokens DeviceNotRegistered. */
export async function revisarRecibos(): Promise<{ revisados: number; borrados: number }> {
  const sb = clienteAdmin();
  // Expo guarda los recibos ~24 h; los tickets más viejos ya no sirven.
  await sb.from("push_tickets").delete().lt("creado_en", new Date(Date.now() - 24 * 3600_000).toISOString());
  // Los recibos tardan en estar listos: solo tickets de hace más de 15 min.
  const { data } = await sb.from("push_tickets").select("ticket_id,token").lt("creado_en", new Date(Date.now() - 15 * 60_000).toISOString()).limit(1000);
  const pendientes = (data ?? []) as { ticket_id: string; token: string }[];
  let revisados = 0, borrados = 0;
  for (const lote of trocear(pendientes, 300)) {
    const res = await fetch(URL_RECIBOS, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: lote.map((t) => t.ticket_id) }), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { console.error("[push] getReceipts respondió", res.status); continue; }
    const json = (await res.json().catch(() => null)) as { data?: Record<string, Resultado> } | null;
    const recibos = json?.data ?? {};
    const listos = lote.filter((t) => recibos[t.ticket_id]);
    const caducados = [...new Set(listos.filter((t) => recibos[t.ticket_id].details?.error === "DeviceNotRegistered").map((t) => t.token))];
    if (caducados.length) { await sb.from("dispositivos_push").delete().in("token", caducados); borrados += caducados.length; }
    if (listos.length) await sb.from("push_tickets").delete().in("ticket_id", listos.map((t) => t.ticket_id));
    revisados += listos.length;
  }
  return { revisados, borrados };
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
}

/** Avisa al conductor asignado de un servicio nuevo. Nunca lanza: los fallos solo se registran. */
export async function notificarServicioNuevo(servicioId: string): Promise<void> {
  try {
    const sb = clienteAdmin();
    const { data: s } = await sb.from("servicios").select("id,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,notas,es_prueba").eq("id", servicioId).maybeSingle();
    if (!s?.conductor_id) return;
    if (s.es_prueba || (s.notas ?? "").startsWith("PRUEBA AUTOMÁTICA")) return; // pruebas automáticas: sin aviso al móvil
    const { data: disp } = await sb.from("dispositivos_push").select("token").eq("conductor_id", s.conductor_id);
    const tokens = (disp ?? []).map((d: { token: string }) => d.token);
    if (!tokens.length) return;
    const mensajes = tokens.map((to) => ({
      to, title: "Servicio nuevo", body: `${hora(s.fecha_hora_recogida)} · ${s.origen_texto} → ${s.destino_texto}`,
      data: { servicioId: s.id, tipo: "servicio_nuevo" }, priority: "high", ...camposSonidoPush({ tipo: "servicio_nuevo" }),
    }));
    await enviarExpo(sb, mensajes);
  } catch (e) {
    console.error("[push] notificarServicioNuevo falló:", e instanceof Error ? e.message : e);
  }
}

/** Aviso genérico al conductor asignado a un servicio (p. ej. cambio de hora). Nunca lanza. */
export async function notificarConductor(servicioId: string, titulo: string, cuerpo: string, tipo: string): Promise<void> {
  try {
    const sb = clienteAdmin();
    const { data: s } = await sb.from("servicios").select("conductor_id").eq("id", servicioId).maybeSingle();
    if (!s?.conductor_id) return;
    const { data: disp } = await sb.from("dispositivos_push").select("token").eq("conductor_id", s.conductor_id);
    const tokens = (disp ?? []).map((d: { token: string }) => d.token);
    if (!tokens.length) return;
    await enviarExpo(sb, tokens.map((to) => ({ to, title: titulo, body: cuerpo, data: { servicioId, tipo }, priority: "high", ...camposSonidoPush({ tipo }) })));
  } catch (e) {
    console.error("[push] notificarConductor falló:", e instanceof Error ? e.message : e);
  }
}

/** Aviso a un conductor concreto (p. ej. la central le ha quitado un servicio). Nunca lanza. */
export async function notificarAConductor(conductorId: string, titulo: string, cuerpo: string, data: { tipo: string; servicioId?: string }): Promise<void> {
  try {
    const sb = clienteAdmin();
    const { data: disp } = await sb.from("dispositivos_push").select("token").eq("conductor_id", conductorId);
    const tokens = (disp ?? []).map((d: { token: string }) => d.token);
    if (!tokens.length) return;
    await enviarExpo(sb, tokens.map((to) => ({ to, title: titulo, body: cuerpo, data, priority: "high", ...camposSonidoPush(data) })));
  } catch (e) {
    console.error("[push] notificarAConductor falló:", e instanceof Error ? e.message : e);
  }
}

/** Tokens de los dispositivos de los usuarios de la central (operadores). */
export async function tokensCentral(sb: Sb = clienteAdmin()): Promise<string[]> {
  const { data: ops, error } = await sb.from("perfiles").select("id").eq("rol", "operador");
  if (error) throw new Error(`operadores: ${error.message}`);
  const ids = (ops ?? []).map((o: { id: string }) => o.id);
  if (!ids.length) return [];
  const { data: disp, error: e2 } = await sb.from("dispositivos_push").select("token").in("conductor_id", ids);
  if (e2) throw new Error(`dispositivos: ${e2.message}`);
  return (disp ?? []).map((d: { token: string }) => d.token);
}

/**
 * Varios avisos a la central de una vez: los tokens se leen UNA vez (o se pasan ya leídos) y todos los mensajes salen en
 * lotes de ≤ 100 por petición. Nunca lanza.
 */
export async function enviarACentral(avisos: readonly MensajeCentral[], o: { sb?: Sb; tokens?: string[] } = {}): Promise<void> {
  if (!avisos.length) return;
  try {
    const sb = o.sb ?? clienteAdmin();
    const tokens = o.tokens ?? (await tokensCentral(sb));
    const mensajes = mensajesCentral(tokens, avisos);
    if (mensajes.length) await enviarExpo(sb, mensajes);
  } catch (e) {
    console.error("[push] enviarACentral falló:", e instanceof Error ? e.message : e);
  }
}

/** Aviso a todos los dispositivos de los usuarios de la central (operadores). Nunca lanza. */
export async function notificarCentral(titulo: string, cuerpo: string, data: Record<string, unknown>): Promise<void> {
  await enviarACentral([{ titulo, cuerpo, data }]);
}
