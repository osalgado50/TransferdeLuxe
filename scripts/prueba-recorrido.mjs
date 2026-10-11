// Prueba de punta a punta del recorrido guardado, contra producción y con un servicio de PRUEBA creado aquí.
// Central asigna → conductor acepta y sale → posiciones simuladas hacia la recogida (Salou) → CARGA → posiciones
// Salou → Aeropuerto de Reus → DESCARGA → el vigilante del servidor guarda el recorrido (≤ 60 s): km plausibles,
// corte en la recogida, filtro de puntos malos y RLS (el conductor lo lee; otro conductor no).
// Las posiciones llevan horas reales entre los eventos (el filtro descarta > 200 km/h), así que tarda ~8 min.
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-recorrido.mjs [conductorEmail=conductor3@transferdeluxe.test] [minutosTramo=2]
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? "https://app.transfersvipluxe.com";
const EMAIL = process.argv[2] ?? "conductor3@transferdeluxe.test";
const MIN_TRAMO = Number(process.argv[3] ?? 2);
const NOTA = `PRUEBA AUTOMÁTICA ${new Date().toISOString()} (recorrido)`;
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
    headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
}
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const accion = (s, servicioId, a) => llamar(s, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId, accion: a });

/** Puntos cada ~100 m a lo largo de una polilínea [lat, lng], con algo de ruido (±3 m). */
function trazar(vertices) {
  const R = 6371e3, rad = (g) => (g * Math.PI) / 180, out = [];
  const dist = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2));
  for (let i = 1; i < vertices.length; i++) {
    const [a, b] = [vertices[i - 1], vertices[i]], n = Math.max(1, Math.round(dist(a, b) / 100));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n + (Math.random() - 0.5) * 5e-5, a[1] + ((b[1] - a[1]) * k) / n + (Math.random() - 0.5) * 5e-5]);
  }
  out.push(vertices.at(-1));
  return out;
}
const R_KM = 6371, rad_ = (g) => (g * Math.PI) / 180;
const kmDe = (pts) => pts.slice(1).reduce((t, b, i) => { const a = pts[i];
  return t + 2 * R_KM * Math.asin(Math.sqrt(Math.sin(rad_(b[0] - a[0]) / 2) ** 2 + Math.cos(rad_(a[0])) * Math.cos(rad_(b[0])) * Math.sin(rad_(b[1] - a[1]) / 2) ** 2)); }, 0);
/** Inserta las posiciones repartidas entre `desde` y ahora (el conductor las sube con su sesión, como la app). */
async function subir(s, puntos, desde) {
  const hasta = Date.now() - 2000, paso_ = (hasta - desde) / (puntos.length - 1);
  const filas = puntos.map(([lat, lng], i) => ({ conductor_id: s.id, lat, lng, velocidad: 15, precision_m: 8, registrado_en: new Date(desde + i * paso_).toISOString() }));
  // Dos puntos malos que el cálculo debe descartar: precisión de 500 m y un salto imposible a Barcelona.
  const mitad = filas[Math.floor(filas.length / 2)];
  filas.push({ ...mitad, lat: mitad.lat + 0.01, precision_m: 500, registrado_en: new Date(Date.parse(mitad.registrado_en) + 300).toISOString() });
  filas.push({ ...mitad, lat: 41.3874, lng: 2.1686, registrado_en: new Date(Date.parse(mitad.registrado_en) + 600).toISOString() });
  const { error } = await s.sb.from("posiciones").insert(filas);
  if (error) throw error;
  return filas.length;
}

// Hacia la recogida (~1,5 km por Salou) y con pasajeros (Salou → Aeropuerto de Reus, ~10 km por carretera).
const HACIA = [[41.0688, 1.1262], [41.0716, 1.1318], [41.0742, 1.1365], [41.076, 1.14]];
const CON = [[41.076, 1.14], [41.0822, 1.1388], [41.0905, 1.1352], [41.1003, 1.1381], [41.1118, 1.1459], [41.1229, 1.1532], [41.1338, 1.1601], [41.1415, 1.1648], [41.1474, 1.1672]];

const central = await sesion("central@transferdeluxe.test");
const yo = await sesion(EMAIL);
const otro = await sesion(EMAIL === "conductor1@transferdeluxe.test" ? "conductor2@transferdeluxe.test" : "conductor1@transferdeluxe.test");
const { data: fila, error: eIns } = await admin.from("servicios").insert({
  cliente_nombre: "Prueba", cliente_apellidos: "Automática", cliente_email: "prueba@transferdeluxe.test", cliente_telefono: "600000000",
  origen_texto: "Salou – Plaza Europa", origen_lat: 41.076, origen_lng: 1.14, destino_texto: "Aeropuerto de Reus", destino_lat: 41.1474, destino_lng: 1.1672,
  pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "minivan", origen_pedido: "manual", estado: "pendiente", notas: NOTA,
  fecha_hora_recogida: new Date(Date.now() + 3 * 60e3 * MIN_TRAMO).toISOString(),
}).select("id").single();
if (eIns) throw eIns;
const sid = fila.id;
console.log(`Servicio de prueba: ${sid} · conductor ${EMAIL} · ${MIN_TRAMO} min por tramo\n`);

let r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: sid, conductorId: yo.id });
paso(r.status === 200, "Central asigna el servicio", `${r.status} ${r.j?.error ?? ""}`);
paso((await accion(yo, sid, "aceptar")).status === 200, "Conductor acepta");
r = await accion(yo, sid, "salir");
const t0 = Date.now();
paso(r.status === 200, "Conductor sale (en camino)");
const puntosHacia = trazar(HACIA);
await dormir(MIN_TRAMO * 60e3);
let n = await subir(yo, puntosHacia, t0 + 1000);
paso(true, "Posiciones hacia la recogida subidas", `${n} (2 malas)`);
r = await accion(yo, sid, "cargar");
const t1 = Date.now();
paso(r.status === 200, "CARGA (recogido)");
const puntosCon = trazar(CON);
await dormir(MIN_TRAMO * 2.5 * 60e3); // ~10 km en 5 min: < 200 km/h
n += await subir(yo, puntosCon, t1 + 1000);
paso(true, "Posiciones con pasajeros subidas", `${puntosCon.length + 2} (2 malas)`);
r = await accion(yo, sid, "descargar");
const t2 = Date.now();
paso(r.status === 200, "DESCARGA (completado)");

let rec = null;
while (!rec && Date.now() - t2 < 90_000) {
  const { data } = await admin.from("recorridos").select("*").eq("servicio_id", sid).maybeSingle();
  if (data) rec = data; else await dormir(3000);
}
paso(!!rec, "El vigilante guarda el recorrido", rec ? `${Math.round((Date.now() - t2) / 1000)} s` : "no apareció en 90 s");
if (rec) {
  const km = Number(rec.km), kmPax = Number(rec.km_con_pasajeros);
  const esperado = kmDe(puntosHacia) + kmDe(puntosCon);
  paso(km >= 8 && km <= 15 && Math.abs(km - esperado) / esperado < 0.05, "Km plausibles (8–15 y ±5 % de la ruta simulada)",
    `${km} km (simulada ${esperado.toFixed(2)} km; con pasajeros ${kmPax} km)`);
  paso(kmPax > 8 && kmPax < km, "Tramo con pasajeros separado", `${kmPax} km`);
  paso(rec.puntos_originales === n, "Cuenta todas las posiciones del viaje", `${rec.puntos_originales} de ${n}`);
  paso(rec.puntos.length >= 4 && rec.puntos.length <= 500, "Línea simplificada (Douglas-Peucker)", `${rec.puntos.length} puntos de ${n - 4} buenos`);
  paso(rec.puntos.every(([lng, lat]) => lat < 41.2 && lng < 1.2), "Sin el salto imposible a Barcelona");
  const pr = rec.puntos[rec.corte];
  paso(rec.corte != null && Math.abs(pr[1] - 41.076) < 0.002 && Math.abs(pr[0] - 1.14) < 0.002, "Corte en el punto de recogida (Salou)", JSON.stringify(pr));
  paso(rec.duracion_min >= MIN_TRAMO * 3.5 - 1, "Duración del viaje", `${rec.duracion_min} min`);
  const mio = await yo.sb.from("recorridos").select("servicio_id,km").eq("servicio_id", sid).maybeSingle();
  paso(mio.data?.servicio_id === sid, "RLS: el conductor ve su recorrido");
  const ajeno = await otro.sb.from("recorridos").select("servicio_id").eq("servicio_id", sid).maybeSingle();
  paso(!ajeno.data, "RLS: otro conductor NO lo ve");
  const cen = await central.sb.from("recorridos").select("servicio_id").eq("servicio_id", sid).maybeSingle();
  paso(cen.data?.servicio_id === sid, "RLS: la central lo ve");
}
await admin.from("servicios").update({ incidencia_vista: true, es_prueba: true }).eq("id", sid); // oculto de listados e informes
await Promise.all([central, yo, otro].map((s) => s.sb.auth.signOut().catch(() => {})));
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
