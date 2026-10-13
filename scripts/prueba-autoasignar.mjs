// Prueba de punta a punta de «Asignar automáticamente» contra producción, con 6 servicios de PRUEBA creados aquí para
// mañana (horas próximas, orígenes distintos). Nunca toca otros servicios: la propuesta y la confirmación van solo con
// estos ids. Comprueba: sin solapes, márgenes ≥ mínimo, reparto equitativo, confirmar asigna (push a cada conductor),
// reintento idempotente y el semáforo en /api/central/resumen. Al final: es_prueba=true, cancelados y vistos.
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-autoasignar.mjs [conductor1@… conductor2@… conductor3@…]
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? "https://app.transfersvipluxe.com";
const EMAILS = process.argv.slice(2).length ? process.argv.slice(2) : ["conductor1@transferdeluxe.test", "conductor2@transferdeluxe.test", "conductor3@transferdeluxe.test"];
const NOTA = `PRUEBA AUTOMÁTICA autoasignar ${new Date().toISOString()}`;
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
  const r = await fetch(API + ruta, { method: metodo, signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, j, ms: Date.now() - t0 };
}
// Mismo modelo de traslado que la app (recta × 1,3 a 70 km/h) para auditar la propuesta por separado.
const rad = (g) => (g * Math.PI) / 180;
const km = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const traslado = (a, b) => (!a || !b ? 30 : km(a, b) < 0.05 ? 0 : Math.ceil(((km(a, b) * 1.3) / 70) * 60));
const fin = (s) => s.inicio + s.duracionMin * 60_000;
const hh = (t) => new Date(t).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

const manana = new Date(Date.now() + 86400e3).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
const enMadrid = (hora) => { // hora local de Madrid de mañana → ISO (octubre: CEST +02:00 hasta el 25; después +01:00)
  for (const off of ["+02:00", "+01:00"]) {
    const d = new Date(`${manana}T${hora}:00${off}`);
    if (d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) === hora) return d.toISOString();
  }
  throw new Error("hora");
};

const central = await sesion("central@transferdeluxe.test");
const conductores = [];
for (const e of EMAILS) conductores.push({ email: e, ...(await sesion(e)) });
const ids = conductores.map((c) => c.id);

const L = {
  salou: ["Salou – Plaza Europa", 41.0764, 1.1416], cambrils: ["Cambrils – Port", 41.067, 1.0597], reus: ["Aeropuerto de Reus", 41.1474, 1.1672],
  tarragona: ["Tarragona – Rambla Nova", 41.1189, 1.2445], pineda: ["La Pineda – Passeig Pau Casals", 41.0753, 1.182], portaventura: ["PortAventura – Hotel Caribe", 41.0878, 1.1572],
};
const base = { cliente_nombre: "Prueba", cliente_apellidos: "Automática", cliente_email: "prueba@transferdeluxe.test", cliente_telefono: "600000000",
  pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "minivan", origen_pedido: "manual", estado: "pendiente", notas: NOTA, es_prueba: false };
const viaje = (hora, o, d, dur) => ({ ...base, fecha_hora_recogida: enMadrid(hora), origen_texto: L[o][0], origen_lat: L[o][1], origen_lng: L[o][2],
  destino_texto: L[d][0], destino_lat: L[d][1], destino_lng: L[d][2], duracion_estimada_min: dur });
const { data: creados, error: eIns } = await admin.from("servicios").insert([
  viaje("09:00", "salou", "reus", 35), viaje("09:10", "cambrils", "reus", 40), viaje("09:20", "tarragona", "salou", 35),
  viaje("10:00", "reus", "pineda", 35), viaje("10:15", "portaventura", "tarragona", 35), viaje("10:30", "reus", "cambrils", 40),
]).select("id");
if (eIns) throw eIns;
const sids = creados.map((c) => c.id);
console.log(`Día ${manana} · servicios de prueba: ${sids.length} · conductores: ${EMAILS.join(", ")}\n`);

try {
  let r = await llamar(central, "GET", `/api/central/autoasignar/propuesta?dia=${manana}`);
  paso(r.status === 200 && sids.every((id) => r.j?.pendientes?.some((p) => p.id === id)), "Datos del diálogo: los 6 de prueba salen como pendientes de mañana", `${r.ms} ms · ${r.j?.pendientes?.length} pendientes · margen ${r.j?.margenMinimo}`);
  const dur = r.j?.pendientes?.find((p) => p.id === sids[0])?.duracionTexto;
  paso(/descarga 15 en aeropuerto/.test(dur ?? ""), "Duración con carga/descarga por tipo de punto", dur);

  r = await llamar(central, "POST", "/api/central/autoasignar/propuesta", { servicioIds: sids, conductorIds: ids, estrategia: "equitativo" });
  paso(r.status === 200, "Propuesta calculada (no asigna nada)", `${r.status} · ${r.ms} ms`);
  const { entrada, propuesta } = r.j;
  const minimo = entrada.margenMinimoMin;
  paso(propuesta.lineas.length === 6 && propuesta.lineas.every((l) => sids.includes(l.servicioId)), "La propuesta solo incluye los 6 servicios de prueba");
  for (const l of propuesta.lineas) {
    const c = conductores.find((x) => x.id === l.conductorId);
    console.log(`   ${hh(entrada.servicios.find((s) => s.id === l.servicioId).inicio)} → ${c ? c.email : "SIN ASIGNAR: " + l.motivoSiNo} · llegada ${l.llegadaEstimada ? hh(l.llegadaEstimada) : "—"} · margen ${l.margenMin ?? "—"} · ${l.kmVacio ?? "—"} km`);
  }
  // Auditoría independiente: por conductor, compromisos + nuevos ordenados, sin solapes y con margen ≥ mínimo en lo nuevo.
  const errores = [];
  for (const c of entrada.conductores) {
    const nuevos = propuesta.lineas.filter((l) => l.conductorId === c.id).map((l) => entrada.servicios.find((s) => s.id === l.servicioId));
    const ruta = [...c.compromisos.map((x) => ({ ...x, fijo: true })), ...nuevos].sort((a, b) => a.inicio - b.inicio);
    for (let i = 1; i < ruta.length; i++) {
      const a = ruta[i - 1], b = ruta[i];
      if (fin(a) > b.inicio) errores.push(`${c.nombre}: solape ${hh(a.inicio)}/${hh(b.inicio)}`);
      const margen = Math.floor((b.inicio - fin(a) - traslado(a.destino, b.origen) * 60_000) / 60_000);
      if ((!a.fijo || !b.fijo) && margen < minimo) errores.push(`${c.nombre}: margen ${margen} min entre ${hh(a.inicio)} y ${hh(b.inicio)}`);
    }
  }
  paso(errores.length === 0, `Sin solapes ni márgenes < ${minimo} min (auditoría independiente)`, errores.join(" | "));
  paso(propuesta.lineas.filter((l) => l.conductorId).every((l) => l.ok && (l.margenMin == null || l.margenMin >= minimo)), "Todas las líneas asignadas cumplen (ok y margen ≥ mínimo)");
  const n = ids.map((id) => propuesta.lineas.filter((l) => l.conductorId === id).length);
  const tot = ids.map((id) => propuesta.metricas.find((m) => m.conductorId === id)?.servicios ?? 0);
  paso(Math.max(...tot) - Math.min(...tot) <= 2 || n.every((x) => x > 0), "Equitativo: reparto entre los conductores", `nuevos ${n.join("/")} · del día ${tot.join("/")}`);

  const lote = randomUUID();
  const lineas = propuesta.lineas.filter((l) => l.conductorId).map((l) => ({ servicioId: l.servicioId, conductorId: l.conductorId }));
  r = await llamar(central, "POST", "/api/central/autoasignar/confirmar", { lote, lineas });
  paso(r.status === 200 && r.j?.asignados === lineas.length && r.j?.errores === 0, "Confirmar y enviar: asigna cada línea", `${r.ms} ms · ${JSON.stringify({ a: r.j?.asignados, s: r.j?.saltados, e: r.j?.errores })}`);
  const { data: tras } = await admin.from("servicios").select("id,estado,conductor_id,vehiculo_id").in("id", sids);
  paso(lineas.every((l) => tras.some((s) => s.id === l.servicioId && s.estado === "asignado" && s.conductor_id === l.conductorId && s.vehiculo_id)),
    "En la BD: asignados al conductor propuesto y con su vehículo habitual");
  for (const c of conductores) {
    const { data: visto } = await c.sb.from("servicios").select("id").in("id", sids);
    const suyos = lineas.filter((l) => l.conductorId === c.id).length;
    paso((visto ?? []).length === suyos, `${c.email} ve sus ${suyos} servicio(s) (RLS)`);
  }
  r = await llamar(central, "POST", "/api/central/autoasignar/confirmar", { lote, lineas });
  paso(r.status === 200 && r.j?.lineas?.every((l) => l.resultado === "ya_asignado"), "Reintento del mismo lote: «ya asignado», sin duplicar");
  const { data: evs } = await admin.from("eventos_servicio").select("servicio_id,tipo").in("servicio_id", sids).eq("tipo", "asignado");
  paso((evs ?? []).length === lineas.length, "Un solo evento «asignado» por servicio", `${(evs ?? []).length}`);
  // Una línea cambiada de estado se salta (no se reasigna): la primera ya está asignada → lote nuevo la salta.
  r = await llamar(central, "POST", "/api/central/autoasignar/confirmar", { lote: randomUUID(), lineas: lineas.slice(0, 1).map((l) => ({ ...l, conductorId: ids.find((x) => x !== l.conductorId) })) });
  paso(r.status === 200 && r.j?.saltados === 1 && /Ya no está pendiente/.test(r.j?.lineas?.[0]?.motivo ?? ""), "Lote nuevo sobre un servicio ya asignado → saltado, no lo cambia", r.j?.lineas?.[0]?.motivo);

  r = await llamar(central, "GET", "/api/central/resumen");
  paso(r.status === 200 && r.j && typeof r.j.puntualidad === "object", "Resumen de la central trae el semáforo «puntualidad»", `${Object.keys(r.j?.puntualidad ?? {}).length} servicios con semáforo hoy`);
} finally {
  // Limpieza suave: nada se borra; quedan cancelados, vistos y marcados es_prueba (fuera de listados e informes).
  await admin.from("servicios").update({ es_prueba: true, incidencia_vista: true }).in("id", sids);
  await admin.from("servicios").update({ estado: "cancelado" }).in("id", sids);
  const { data: fin2 } = await admin.from("servicios").select("estado,es_prueba").in("id", sids);
  paso(fin2.every((s) => s.es_prueba && s.estado === "cancelado"), "Limpieza: los 6 de prueba quedan es_prueba=true y cancelados");
  await Promise.all([central, ...conductores].map((s) => s.sb.auth.signOut({ scope: "local" }).catch(() => {})));
}
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
