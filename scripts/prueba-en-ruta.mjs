// Prueba real en ruta: espera a que un conductor de demo se ponga «En servicio» con GPS reciente y le envía 3 servicios
// desde la central (como un operador: /api/central/asignar → push), separados unos minutos. Nota «PRUEBA EN RUTA».
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-en-ruta.mjs [esperaMin=40] [cadaMin=4]
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? "https://app.transfersvipluxe.com";
const ESPERA_MIN = Number(process.argv[2] ?? 40), CADA_MIN = Number(process.argv[3] ?? 4);
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid" }), ...a);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const LUGARES = [
  { t: "Aeropuerto de Reus", lat: 41.1474, lng: 1.1672 }, { t: "PortAventura World", lat: 41.088, lng: 1.157 },
  { t: "Salou – Plaza Europa", lat: 41.076, lng: 1.14 }, { t: "Cambrils – Puerto", lat: 41.067, lng: 1.0605 },
  { t: "Estación de Tarragona", lat: 41.1112, lng: 1.253 }, { t: "Reus centro", lat: 41.1561, lng: 1.1069 },
];
const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));

async function sesion(email) {
  const { data: l, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error: e2 } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: l.properties.hashed_token });
  if (e2) throw e2;
  return data.session.access_token;
}

// 1) Esperar a un conductor (o jefe que conduce) en servicio con posición de hace < 90 s.
const fin = Date.now() + ESPERA_MIN * 60_000;
let elegido = null;
log(`Esperando hasta ${ESPERA_MIN} min a que alguien se ponga «En servicio»…`);
while (!elegido && Date.now() < fin) {
  const { data: pos } = await admin.from("posicion_actual").select("conductor_id,lat,lng,en_servicio,registrado_en").eq("en_servicio", true)
    .gte("registrado_en", new Date(Date.now() - 90_000).toISOString());
  if (pos?.length) {
    const { data: p } = await admin.from("perfiles").select("id,nombre,vehiculo_habitual_id").in("id", pos.map((x) => x.conductor_id));
    const x = pos[0]; const per = p.find((y) => y.id === x.conductor_id);
    elegido = { ...x, nombre: per?.nombre ?? "?", vehiculo: per?.vehiculo_habitual_id ?? null };
  } else await esperar(30_000);
}
if (!elegido) { log("Nadie se ha puesto en servicio a tiempo. No envío nada."); process.exit(0); }
log(`En servicio: ${elegido.nombre} en ${elegido.lat.toFixed(4)},${elegido.lng.toFixed(4)}`);

// 2) Tres servicios: recogida en el lugar conocido más cercano, destino otro lugar; recogida dentro de 45/90/120 min.
const token = await sesion("central@transferdeluxe.test");
const cercanos = [...LUGARES].sort((a, b) => dist(a, elegido) - dist(b, elegido));
const plan = [[cercanos[0], cercanos[3], 45], [cercanos[1], cercanos[0], 90], [cercanos[2], cercanos[4], 120]];
const creados = [];
for (const [i, [o, d, min]] of plan.entries()) {
  if (i > 0) { log(`Siguiente envío en ${CADA_MIN} min…`); await esperar(CADA_MIN * 60_000); }
  const { data: s, error } = await admin.from("servicios").insert({
    cliente_nombre: ["Lucía", "Hugo", "Emma"][i], cliente_apellidos: "Prueba", cliente_email: `ruta${i + 1}@transferdeluxe.test`, cliente_telefono: "600000000",
    origen_texto: o.t, origen_lat: o.lat, origen_lng: o.lng, destino_texto: d.t, destino_lat: d.lat, destino_lng: d.lng,
    fecha_hora_recogida: new Date(Date.now() + min * 60_000).toISOString(), pasajeros: 2 + i, maletas: 1 + i,
    tipo_vehiculo_pedido: "minivan", origen_pedido: "manual", estado: "pendiente", notas: "PRUEBA EN RUTA",
  }).select("id").single();
  if (error) { log("No se pudo crear:", error.message); continue; }
  const r = await fetch(`${API}/api/central/asignar`, { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ idAccion: randomUUID(), servicioId: s.id, conductorId: elegido.conductor_id, vehiculoId: elegido.vehiculo }) });
  creados.push(s.id);
  log(`Servicio ${i + 1}/3 enviado (${r.status}): ${o.t} → ${d.t}, recogida en ${min} min · id ${s.id}`);
}
console.log("IDS:" + creados.join(","));
