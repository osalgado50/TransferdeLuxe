// Prueba de punta a punta del ciclo de una misión contra producción, con servicios de PRUEBA creados aquí (nunca toca otros).
// Central asigna → conductor lo ve (RLS) → acepta (y duplicado idempotente) → orden incorrecto rechazado → en camino →
// incidencia «retraso» → «llegando» → CARGA → DESCARGA. Segundo servicio: el conductor lo rechaza con motivo.
// Al final las alertas e incidencias de prueba quedan vistas/resueltas para no ensuciar la central.
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-mision.mjs [conductorEmail=conductor3@transferdeluxe.test]
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? "https://app.transfersvipluxe.com";
const EMAIL = process.argv[2] ?? "conductor3@transferdeluxe.test";
const NOTA = `PRUEBA AUTOMÁTICA ${new Date().toISOString()}`;
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function sesion(email) {
  const { data: l, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error: e2 } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: l.properties.hashed_token });
  if (e2) throw e2;
  return { sb, token: data.session.access_token, id: data.user.id };
}
let fallos = 0;
const paso = (ok, texto, extra = "") => { if (!ok) fallos++; console.log(`${ok ? "✔" : "✘"} ${texto}${extra ? "  · " + extra : ""}`); };
async function llamar(s, metodo, ruta, cuerpo) {
  const t0 = Date.now();
  const r = await fetch(API + ruta, { method: metodo, signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, j, ms: Date.now() - t0 };
}
const estado = async (id) => (await admin.from("servicios").select("estado,conductor_id,ultima_incidencia").eq("id", id).single()).data;

const central = await sesion("central@transferdeluxe.test");
const yo = await sesion(EMAIL);
const base = { cliente_nombre: "Prueba", cliente_apellidos: "Automática", cliente_email: "prueba@transferdeluxe.test", cliente_telefono: "600000000",
  origen_texto: "Salou – Plaza Europa", origen_lat: 41.076, origen_lng: 1.14, destino_texto: "Aeropuerto de Reus", destino_lat: 41.1474, destino_lng: 1.1672,
  pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "minivan", origen_pedido: "manual", estado: "pendiente", notas: NOTA };
const { data: creados, error: eIns } = await admin.from("servicios").insert([
  { ...base, fecha_hora_recogida: new Date(Date.now() + 2 * 3600e3).toISOString() },
  { ...base, fecha_hora_recogida: new Date(Date.now() + 3 * 3600e3).toISOString() },
]).select("id");
if (eIns) throw eIns;
const [s1, s2] = creados.map((c) => c.id);
console.log(`Servicios de prueba: ${s1}, ${s2} · conductor ${EMAIL}\n`);

let r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${s1}`);
paso(r.status === 200 && r.j?.sugerencias?.some((x) => x.conductorId === yo.id), "Central: la sugerencia incluye al conductor", `${r.ms} ms`);
r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: s1, conductorId: yo.id });
paso(r.status === 200 && (await estado(s1)).estado === "asignado", "Central asigna el servicio", `${r.ms} ms`);
const { data: visto } = await yo.sb.from("servicios").select("id,estado").eq("id", s1).maybeSingle();
paso(visto?.estado === "asignado", "Conductor lo recibe (lo ve en su app por RLS)");
const { data: ajeno } = await yo.sb.from("servicios").select("id").neq("conductor_id", yo.id).limit(1);
paso((ajeno ?? []).length === 0, "Conductor NO ve servicios de otros");

const idAceptar = randomUUID();
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: idAceptar, servicioId: s1, accion: "aceptar" });
paso(r.status === 200 && (await estado(s1)).estado === "aceptado", "Conductor ACEPTA", `${r.ms} ms`);
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: idAceptar, servicioId: s1, accion: "aceptar" });
paso(r.status === 200 && r.j?.duplicada === true, "Reenvío del mismo toque (sin cobertura) → idempotente, no duplica");
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s1, accion: "descargar" });
paso(r.status === 409, "Orden incorrecto (DESCARGA sin cargar) → rechazado", r.j?.error ?? "");
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s1, accion: "salir" });
paso(r.status === 200 && (await estado(s1)).estado === "en_camino", "Conductor sale (en camino)", `${r.ms} ms`);
r = await llamar(yo, "POST", "/api/conductor/incidencia", { tipo: "retraso", descripcion: `${NOTA}: atasco, llego 10 min tarde`, servicio_id: s1, lat: 41.0764, lng: 1.1416 });
paso(r.status === 200, "Conductor avisa: llega tarde (incidencia «retraso»)", `${r.status} ${r.j?.error ?? ""}`);
r = await llamar(yo, "POST", "/api/conductor/llegando", { servicioId: s1, objetivo: "recogida" });
paso(r.status === 200, "Aviso «llegando» a la recogida", `${r.status}`);
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s1, accion: "cargar" });
paso(r.status === 200 && (await estado(s1)).estado === "recogido", "CARGA (pasajeros a bordo)", `${r.ms} ms`);
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s1, accion: "descargar" });
paso(r.status === 200 && (await estado(s1)).estado === "completado", "DESCARGA (servicio completado)", `${r.ms} ms`);

r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: s2, conductorId: yo.id });
paso(r.status === 200, "Central asigna un segundo servicio");
r = await llamar(yo, "POST", "/api/conductor/incidencia", { tipo: "no_presentado", descripcion: `${NOTA}: el cliente no está`, servicio_id: s2, lat: 41.1474, lng: 1.1672 });
paso(r.status === 200, "Conductor avisa: cliente no presentado");
r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s2, accion: "rechazar", motivo: "Cliente no presentado" });
const e2 = await estado(s2);
paso(r.status === 200 && e2.estado === "pendiente" && /rechaz/.test(e2.ultima_incidencia ?? ""), "Conductor RECHAZA con motivo → vuelve a la central", e2.ultima_incidencia ?? "");
r = await llamar(central, "GET", "/api/central/resumen");
paso(r.status === 200 && r.j?.alertas?.some((s) => s.id === s2), "La central ve la alerta del rechazo", `${r.ms} ms`);
const act = r.j?.actividad ?? [];
const tiposS1 = act.filter((m) => m.servicioId === s1).map((m) => m.tipo);
paso(["aceptado", "en_camino", "recogido", "completado"].every((t) => tiposS1.includes(t)), "Actividad en vivo: aceptado, en camino, recogido y completado", tiposS1.join(" ← "));
paso(act.some((m) => m.servicioId === s2 && m.tipo === "rechazado" && m.gravedad === "aviso"), "Actividad en vivo: el rechazo como aviso");
const incAct = act.filter((m) => m.incidenciaId && (m.descripcion ?? "").startsWith(NOTA));
paso(incAct.length === 2 && incAct.every((m) => m.conductor && m.zona), "Actividad en vivo: incidencias con conductor y zona", incAct.map((m) => `${m.zona}`).join(" | "));
for (const m of act.filter((x) => x.servicioId === s1 || x.servicioId === s2).slice(0, 12)) console.log(`   ${m.hora} [${m.gravedad}] ${m.texto}`);

const { data: ev } = await admin.from("eventos_servicio").select("tipo").eq("servicio_id", s1).order("creado_en");
paso(["asignado", "aceptado", "en_camino", "recogido", "completado"].every((t) => ev.some((e) => e.tipo === t)),
  "Historial de eventos completo", ev.map((e) => e.tipo).join(" → "));
const { count } = await admin.from("incidencias").select("id", { count: "exact", head: true }).like("descripcion", `${NOTA}%`);
paso(count === 2, "Las 2 incidencias llegan a la central", String(count));

// Limpieza suave: nada se borra; lo de prueba queda visto/resuelto/cancelado para no ensuciar la central.
await admin.from("incidencias").update({ resuelta: true, resuelta_en: new Date().toISOString() }).like("descripcion", `${NOTA}%`);
await admin.from("servicios").update({ incidencia_vista: true }).in("id", [s1, s2]);
await admin.from("servicios").update({ estado: "cancelado" }).eq("id", s2);
await Promise.all([central, yo].map((s) => s.sb.auth.signOut().catch(() => {})));
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
