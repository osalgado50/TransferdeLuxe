// Prueba de punta a punta del aviso al cliente contra producción, con un servicio de PRUEBA creado aquí (nunca toca otros).
// Central asigna → conductor acepta (se crea el enlace /s/<token>) → la ruta pública devuelve SOLO estado/posición/ETA/
// nombre de pila/vehículo → en camino con posición → aviso_cliente (idempotente) en la Actividad → «No puedo hacer este
// servicio» (devolver, idempotente) → pendiente sin conductor + alerta en la central → la página pasa a «asignando» →
// aviso de cambio de conductor. Al final: alerta vista, servicio es_prueba y cancelado, conductor fuera de servicio.
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-aviso.mjs [conductorEmail=conductor3@transferdeluxe.test]
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
  const r = await fetch(API + ruta, { method: metodo, signal: AbortSignal.timeout(15000),
    headers: { ...(s ? { authorization: `Bearer ${s.token}` } : {}), "content-type": "application/json", "accept-language": "es-ES,es;q=0.9" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch { /* no JSON */ }
  return { status: r.status, j, texto };
}
const estado = async (id) => (await admin.from("servicios").select("estado,conductor_id,ultima_incidencia,incidencia_vista").eq("id", id).single()).data;
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

const central = await sesion("central@transferdeluxe.test");
const yo = await sesion(EMAIL);
const CLIENTE = { cliente_nombre: "Prueba", cliente_apellidos: "Automática", cliente_email: "prueba-aviso@transferdeluxe.test", cliente_telefono: "600000000" };
const { data: fila, error: eIns } = await admin.from("servicios").insert({
  ...CLIENTE, origen_texto: "Salou – Plaza Europa", origen_lat: 41.076, origen_lng: 1.14, destino_texto: "Aeropuerto de Reus",
  destino_lat: 41.1474, destino_lng: 1.1672, pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "minivan", origen_pedido: "manual",
  estado: "pendiente", notas: NOTA, fecha_hora_recogida: new Date(Date.now() + 2 * 3600e3).toISOString(),
}).select("id").single();
if (eIns) throw eIns;
const s = fila.id;
console.log(`Servicio de prueba: ${s} · conductor ${EMAIL}\n`);

try {
  let r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: s, conductorId: yo.id });
  paso(r.status === 200 && (await estado(s)).estado === "asignado", "Central asigna el servicio", `${r.status} ${r.j?.error ?? ""}`);
  r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s, accion: "aceptar" });
  paso(r.status === 200 && (await estado(s)).estado === "aceptado", "Conductor ACEPTA");
  let seg = null;
  for (let i = 0; i < 10 && !seg; i++) { seg = (await admin.from("seguimientos").select("token").eq("servicio_id", s).maybeSingle()).data; if (!seg) await espera(500); }
  paso(!!seg && seg.token.length >= 43, "Al aceptar se crea el enlace de seguimiento (token aleatorio largo)", seg ? `${seg.token.length} caracteres` : "no se creó");

  r = await llamar(yo, "GET", `/api/conductor/aviso-cliente?servicioId=${s}`);
  paso(r.status === 200 && r.j?.ruta === `/s/${seg?.token}` && !!r.j?.conductor, "Conductor: datos del aviso (enlace, nombre de pila, vehículo)", JSON.stringify(r.j));
  r = await llamar(null, "GET", `/api/s/${seg.token}`);
  paso(r.status === 200 && r.j?.estado === "confirmado" && r.j?.posicion === null, "Página pública (aceptado): «confirmado», sin posición", r.texto);
  const limpio = (t) => !/Prueba|Automática|600000000|prueba-aviso|Salou|Reus/.test(t);
  paso(limpio(r.texto) && Object.keys(r.j ?? {}).sort().join() === "actualizado,conductor,estado,eta,posicion,vehiculo", "La ruta pública NO devuelve datos del cliente ni direcciones", Object.keys(r.j ?? {}).join(","));
  const pag = await fetch(`${API}/s/${seg.token}`, { signal: AbortSignal.timeout(15000), headers: { "accept-language": "en-GB,en;q=0.9" } });
  const html = await pag.text();
  paso(pag.status === 200 && /noindex/.test(html) && /Your driver is confirmed/.test(html) && limpio(html.replace(/<script[\s\S]*?<\/script>/g, "")), "Página /s/<token>: 200, noindex y en inglés con Accept-Language: en", `${pag.status}`);
  r = await llamar(null, "GET", `/api/s/${"x".repeat(43)}`);
  paso(r.status === 404, "Token inventado → 404", `${r.status}`);

  // En camino con una posición reciente (la misma zona de su última posición conocida).
  const { error: ePos } = await yo.sb.from("posiciones").insert({ conductor_id: yo.id, lat: 41.0857657, lng: 1.1420691, velocidad: 8, precision_m: 10, registrado_en: new Date().toISOString() });
  paso(!ePos, "Conductor envía una posición (como la app)", ePos?.message ?? "");
  r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId: s, accion: "salir" });
  paso(r.status === 200 && (await estado(s)).estado === "en_camino", "Conductor sale (en camino)");
  r = await llamar(null, "GET", `/api/s/${seg.token}`);
  paso(r.status === 200 && ["de_camino", "llegando"].includes(r.j?.estado) && r.j?.posicion?.lat && r.j?.eta?.objetivo === "recogida" && limpio(r.texto),
    "Página pública (en camino): estado, posición y ETA a la recogida", r.texto);

  const idAviso = randomUUID();
  r = await llamar(yo, "POST", "/api/conductor/aviso-cliente", { idAccion: idAviso, servicioId: s, tipo: "en_camino", canal: "whatsapp" });
  paso(r.status === 200 && r.j?.ok === true, "Conductor registra «aviso_cliente: en camino»", `${r.status} ${r.j?.error ?? ""}`);
  r = await llamar(yo, "POST", "/api/conductor/aviso-cliente", { idAccion: idAviso, servicioId: s, tipo: "en_camino", canal: "whatsapp" });
  const { count: nAvisos } = await admin.from("eventos_servicio").select("id", { count: "exact", head: true }).eq("servicio_id", s).eq("tipo", "aviso_cliente");
  paso(r.j?.duplicada === true && nAvisos === 1, "Reenvío del mismo aviso → idempotente", `${nAvisos} evento(s)`);
  r = await llamar(central, "GET", "/api/central/resumen");
  const ma = (r.j?.actividad ?? []).find((m) => m.servicioId === s && m.tipo === "aviso_cliente");
  paso(!!ma && /^💬 .+ ha avisado al cliente .*: en camino$/.test(ma.texto), "Actividad en vivo: «💬 … ha avisado al cliente: en camino»", ma?.texto ?? "");

  // «No puedo hacer este servicio».
  const idDev = randomUUID();
  r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: idDev, servicioId: s, accion: "devolver" });
  paso(r.status === 409, "Devolver sin motivo → rechazado", r.j?.error ?? "");
  r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: idDev, servicioId: s, accion: "devolver", motivo: "Avería" });
  const e1 = await estado(s);
  paso(r.status === 200 && e1.estado === "pendiente" && e1.conductor_id === null && e1.ultima_incidencia === "devuelto: Avería" && e1.incidencia_vista === false,
    "Conductor DEVUELVE (Avería) → pendiente, sin conductor, alerta para la central", JSON.stringify(e1));
  r = await llamar(yo, "POST", "/api/conductor/accion", { idAccion: idDev, servicioId: s, accion: "devolver", motivo: "Avería" });
  const { data: devs } = await admin.from("eventos_servicio").select("actor_id,motivo").eq("servicio_id", s).eq("tipo", "devuelto");
  paso(r.status === 200 && r.j?.duplicada === true && devs.length === 1 && devs[0].actor_id === yo.id && devs[0].motivo === "Avería",
    "Reenvío desde la cola offline → idempotente; evento «devuelto» con motivo", `${devs.length} evento(s)`);
  r = await llamar(central, "GET", "/api/central/resumen");
  const alerta = (r.j?.alertas ?? []).find((x) => x.id === s);
  const md = (r.j?.actividad ?? []).find((m) => m.servicioId === s && m.tipo === "devuelto");
  paso(!!alerta && (r.j?.pendientes ?? []).some((x) => x.id === s), "Central: alerta y servicio en «Sin asignar»", alerta?.ultima_incidencia ?? "");
  paso(!!md && md.gravedad === "aviso" && /^🔁 .+ ha devuelto el servicio de las \d\d:\d\d: Avería$/.test(md.texto), "Actividad en vivo: «🔁 … ha devuelto el servicio de las HH:MM: Avería»", md?.texto ?? "");
  r = await llamar(null, "GET", `/api/s/${seg.token}`);
  paso(r.status === 200 && r.j?.estado === "asignando" && r.j?.conductor === null && r.j?.posicion === null, "Página pública: «asignando», sin conductor ni coche", r.texto);
  r = await llamar(yo, "POST", "/api/conductor/aviso-cliente", { idAccion: randomUUID(), servicioId: s, tipo: "reasignacion", canal: "sms" });
  paso(r.status === 200, "Tras devolver, el conductor puede avisar del cambio (SMS)", `${r.status} ${r.j?.error ?? ""}`);
  const otro = await sesion("conductor2@transferdeluxe.test").catch(() => null);
  if (otro) {
    r = await llamar(otro, "GET", `/api/conductor/aviso-cliente?servicioId=${s}`);
    paso(r.status === 409, "Otro conductor no puede pedir los datos del aviso", `${r.status}`);
    await otro.sb.auth.signOut({ scope: "local" }).catch(() => {});
  }
  r = await llamar(central, "GET", `/api/central/aviso-cliente?servicioId=${s}`);
  paso(r.status === 200 && r.j?.ok === true, "Central: datos del aviso desde la app", `${r.status}`);
} finally {
  // Limpieza suave: nada se borra; alerta vista, es_prueba (fuera de listados e informes) y cancelado.
  await admin.from("servicios").update({ incidencia_vista: true, es_prueba: true, estado: "cancelado" }).eq("id", s);
  await llamar(yo, "POST", "/api/conductor/fuera-de-servicio").catch(() => {});
  await Promise.all([central, yo].map((x) => x.sb.auth.signOut({ scope: "local" }).catch(() => {})));
}
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
