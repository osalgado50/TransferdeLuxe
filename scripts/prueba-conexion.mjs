// Prueba de conexión de SOLO LECTURA contra producción: simula a la central y a los conductores de demo usando la app
// a la vez (como los móviles: Bearer + lecturas Supabase con RLS) y mide latencias y errores.
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-conexion.mjs [minutos=3]
// Las sesiones se generan con enlaces mágicos de las cuentas @transferdeluxe.test (sin contraseñas). No escribe datos.
import { createClient } from "@supabase/supabase-js";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? "https://app.transfersvipluxe.com";
const MINUTOS = Number(process.argv[2] ?? 3);
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function sesion(email) {
  const { data: l, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error: e2 } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: l.properties.hashed_token });
  if (e2) throw e2;
  return { sb, token: data.session.access_token, id: data.user.id, email };
}

const medidas = new Map(); // nombre → {n, err, ms[]}
function anotar(nombre, ms, ok, detalle) {
  const m = medidas.get(nombre) ?? { n: 0, err: 0, ms: [], ejemplos: [] };
  m.n++; m.ms.push(ms); if (!ok) { m.err++; if (m.ejemplos.length < 3) m.ejemplos.push(detalle); }
  medidas.set(nombre, m);
}
async function api(s, nombre, ruta) {
  const t0 = Date.now();
  try {
    const r = await fetch(API + ruta, { headers: { authorization: `Bearer ${s.token}`, "user-agent": "PruebaConexion/1" }, signal: AbortSignal.timeout(15000) });
    const ct = r.headers.get("content-type") ?? "";
    await r.text();
    anotar(nombre, Date.now() - t0, r.ok && ct.includes("json"), `${r.status} ${ct}`);
  } catch (e) { anotar(nombre, Date.now() - t0, false, String(e).slice(0, 80)); }
}
async function bd(s, nombre, f) {
  const t0 = Date.now();
  try { const { error } = await f(s.sb); anotar(nombre, Date.now() - t0, !error, error?.message); }
  catch (e) { anotar(nombre, Date.now() - t0, false, String(e).slice(0, 80)); }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const central = await sesion("central@transferdeluxe.test");
const conductores = await Promise.all(["conductor1", "conductor2", "conductor3"].map((c) => sesion(`${c}@transferdeluxe.test`)));
const fin = Date.now() + MINUTOS * 60_000;
console.log(`Prueba de ${MINUTOS} min contra ${API} · central + ${conductores.length} conductores`);

const bucleCentral = async () => {
  while (Date.now() < fin) {
    await api(central, "central GET /api/central/resumen", "/api/central/resumen");
    await bd(central, "central lee posicion_actual", (sb) => sb.from("posicion_actual").select("*"));
    await esperar(10_000);
  }
};
const bucleConductor = async (c) => {
  let vuelta = 0;
  while (Date.now() < fin) {
    await bd(c, "conductor lee sus servicios", (sb) => sb.from("servicios").select("id,estado,fecha_hora_recogida").eq("conductor_id", c.id).limit(50));
    await bd(c, "conductor lee ajustes", (sb) => sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle());
    if (vuelta++ % 4 === 0) await api(c, "conductor GET /api/ruta", "/api/ruta?o=41.0763,1.1416&d=41.1474,1.1672");
    await esperar(5_000);
  }
};
await Promise.all([bucleCentral(), ...conductores.map(bucleConductor)]);

const p = (xs, q) => { const o = [...xs].sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.floor(q * o.length))]; };
console.log("\nOperación | peticiones | errores | p50 ms | p95 ms | máx ms");
for (const [k, m] of medidas) console.log(`${k} | ${m.n} | ${m.err} | ${p(m.ms, 0.5)} | ${p(m.ms, 0.95)} | ${Math.max(...m.ms)}${m.ejemplos.length ? "  ← " + m.ejemplos.join(" ; ") : ""}`);
await Promise.all([central, ...conductores].map((s) => s.sb.auth.signOut().catch(() => {})));
