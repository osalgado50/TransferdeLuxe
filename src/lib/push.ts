import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";

const URL_EXPO = "https://exp.host/--/api/v2/push/send";

function hora(iso: string) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
}

/** Avisa al conductor asignado de un servicio nuevo. Nunca lanza: los fallos solo se registran. */
export async function notificarServicioNuevo(servicioId: string): Promise<void> {
  try {
    const sb = clienteAdmin();
    const { data: s } = await sb.from("servicios").select("id,conductor_id,fecha_hora_recogida,origen_texto,destino_texto").eq("id", servicioId).maybeSingle();
    if (!s?.conductor_id) return;
    const { data: disp } = await sb.from("dispositivos_push").select("token").eq("conductor_id", s.conductor_id);
    const tokens = (disp ?? []).map((d: { token: string }) => d.token);
    if (!tokens.length) return;
    const mensajes = tokens.map((to) => ({
      to, title: "Servicio nuevo", body: `${hora(s.fecha_hora_recogida)} · ${s.origen_texto} → ${s.destino_texto}`,
      data: { servicioId: s.id, tipo: "servicio_nuevo" }, sound: "default", priority: "high", channelId: "servicios",
    }));
    const res = await fetch(URL_EXPO, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(mensajes), signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    const caducados = (json?.data ?? []).map((t, i) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? tokens[i] : null)).filter((t): t is string => !!t);
    if (caducados.length) await sb.from("dispositivos_push").delete().in("token", caducados);
  } catch (e) {
    console.error("[push] notificarServicioNuevo falló:", e instanceof Error ? e.message : e);
  }
}
