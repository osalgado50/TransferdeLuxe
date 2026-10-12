// Prueba de punta a punta de la HOJA DE CIERRE de jornada contra producción (cuenta demo conductor3; nada se borra).
// Jornada 1: iniciar → «finalizar» sin hoja rechazado → km menores rechazados → cierre con 2 zonas dañadas + falta aceite
// (grave) → reenvío idempotente → fila en cierres_jornada, jornada finalizada, km del vehículo actualizado → la central
// lo ve en actividad/graves → «Visto». Jornada 2: cierre todo OK → info verde. Jornada 3: incidencia GOLPE con 2 zonas
// (grave con zonas en la central) y hoja de cierre que las incluye. Al final los km se restauran (si nadie los
// tocó) y los cierres quedan vistos. Las hojas de prueba llevan el comentario «PRUEBA AUTOMÁTICA…» (sin push a la central).
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-cierre.mjs [conductorEmail=conductor3@transferdeluxe.test]
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
const tecnico = (o = {}) => ({ neumaticos: "ok", aceite: "ok", refrigerante: "ok", luces: "ok", testigos_cuadro: "ok", otra_averia: "ok", testigos: [], ...o });

const central = await sesion("central@transferdeluxe.test");
const yo = await sesion(EMAIL);
const { data: aj } = await admin.from("ajustes").select("modulos").eq("id", 1).single();
const mod = (k) => aj?.modulos?.[k] !== false;
const obligatoria = mod("jornada") && mod("checklist") && mod("cierre");
if (!mod("jornada")) { console.log("El módulo «jornada» está desactivado en la central: no se puede probar."); process.exit(1); }
const { data: perfil } = await admin.from("perfiles").select("vehiculo_habitual_id").eq("id", yo.id).single();
const { data: vehs } = await admin.from("vehiculos").select("id,matricula,km_actuales").eq("estado", "activo").order("matricula");
const veh = vehs.find((v) => v.id === perfil.vehiculo_habitual_id) ?? vehs[0];
const kmAntes = veh.km_actuales;
console.log(`Conductor ${EMAIL} · vehículo ${veh.matricula} (${kmAntes} km) · hoja obligatoria: ${obligatoria ? "sí" : "no"}\n`);

// ── Jornada 1: cierre con daños (grave) ──
let r = await llamar(yo, "POST", "/api/conductor/jornada", { accion: "iniciar" });
paso(r.status === 200, "Conductor inicia la jornada", `${r.ms} ms`);
r = await llamar(yo, "POST", "/api/conductor/cierre", { idAccion: randomUUID(), vehiculo_id: veh.id, zonas: [], tecnico: tecnico(), combustible: "lleno", km: Math.max(0, kmAntes - 1), comentario: NOTA });
paso(kmAntes === 0 || r.status === 400, "Km menores que los actuales → rechazado", r.j?.error ?? String(r.status));
r = await llamar(yo, "POST", "/api/conductor/cierre", { idAccion: randomUUID(), vehiculo_id: veh.id, zonas: ["ala_delta"], tecnico: tecnico(), combustible: "lleno", comentario: NOTA });
paso(r.status === 400, "Zona inexistente → rechazada", r.j?.error ?? String(r.status));

const id1 = randomUUID();
const cuerpo1 = { idAccion: id1, vehiculo_id: veh.id, zonas: ["puerta_del_izq", "aleta_tras_der"], tecnico: tecnico({ aceite: "falta" }), combustible: "1_2", km: kmAntes + 1, comentario: `${NOTA}: golpe en la puerta al aparcar` };
r = await llamar(yo, "POST", "/api/conductor/cierre", cuerpo1);
paso(r.status === 200 && r.j?.gravedad === "grave" && r.j?.duplicada === false, "Hoja de cierre con 2 zonas dañadas + falta aceite → GRAVE", `${r.ms} ms ${r.j?.error ?? ""}`);
r = await llamar(yo, "POST", "/api/conductor/cierre", cuerpo1);
paso(r.status === 200 && r.j?.duplicada === true, "Reenvío del mismo envío (sin cobertura) → idempotente");
const { data: c1 } = await admin.from("cierres_jornada").select("*").eq("id_accion", id1).single();
paso(c1?.gravedad === "grave" && c1.zonas.join() === "puerta_del_izq,aleta_tras_der" && c1.tecnico.aceite === "falta" && c1.km === kmAntes + 1 && !c1.visto,
  "Fila en cierres_jornada (zonas, técnico, km)", c1 ? `${c1.zonas.join(", ")} · aceite ${c1.tecnico.aceite}` : "no existe");
const { count: nC1 } = await admin.from("cierres_jornada").select("id", { count: "exact", head: true }).eq("jornada_id", c1.jornada_id);
paso(nC1 === 1, "Un solo cierre para la jornada");
const { data: j1 } = await admin.from("jornadas").select("fin").eq("id", c1.jornada_id).single();
paso(!!j1?.fin, "La jornada queda FINALIZADA (misma transacción)");
const { data: v1 } = await admin.from("vehiculos").select("km_actuales").eq("id", veh.id).single();
paso(v1.km_actuales === kmAntes + 1, "Km del vehículo actualizados", `${kmAntes} → ${v1.km_actuales}`);
const { data: suyos } = await yo.sb.from("cierres_jornada").select("id").eq("id", c1.id);
paso(suyos?.length === 1, "RLS: el conductor ve su hoja de cierre");
const { error: eIns } = await yo.sb.from("cierres_jornada").insert({ jornada_id: c1.jornada_id, conductor_id: yo.id, vehiculo_id: veh.id, combustible: "lleno", gravedad: "ok" });
paso(!!eIns, "RLS: el conductor NO puede escribir directamente en cierres_jornada");
r = await llamar(yo, "POST", "/api/conductor/jornada", { accion: "finalizar" });
paso(r.status === 200, "«Finalizar» con la jornada ya cerrada → ok (idempotente)");

r = await llamar(central, "GET", "/api/central/resumen");
const mg = (r.j?.actividad ?? []).find((m) => m.id === `cie-${c1.id}`);
const gg = (r.j?.graves ?? []).find((m) => m.id === `cie-${c1.id}`);
paso(mg?.gravedad === "grave" && !!gg && gg.zonasDanadas?.length === 2, "Central: GRAVE en actividad y en «graves» (tarjeta roja)", mg?.texto ?? "no aparece");
r = await llamar(central, "POST", "/api/central/cierre-visto", { cierreId: c1.id });
const { data: c1b } = await admin.from("cierres_jornada").select("visto").eq("id", c1.id).single();
paso(r.status === 200 && c1b.visto === true, "Central pulsa «Visto»");
r = await llamar(central, "GET", "/api/central/resumen");
paso(!(r.j?.graves ?? []).some((m) => m.id === `cie-${c1.id}`), "Ya no está entre las graves pendientes");

// ── Jornada 2: todo en verde ──
r = await llamar(yo, "POST", "/api/conductor/jornada", { accion: "iniciar" });
paso(r.status === 200, "Conductor inicia otra jornada");
const id2 = randomUUID();
r = await llamar(yo, "POST", "/api/conductor/cierre", { idAccion: id2, vehiculo_id: veh.id, zonas: [], tecnico: tecnico(), combustible: "3_4", km: null, comentario: NOTA });
paso(r.status === 200 && r.j?.gravedad === "ok", "Hoja de cierre sin incidencias → OK", `${r.ms} ms ${r.j?.error ?? ""}`);
const { data: c2 } = await admin.from("cierres_jornada").select("*").eq("id_accion", id2).single();
r = await llamar(central, "GET", "/api/central/resumen");
const mo = (r.j?.actividad ?? []).find((m) => m.id === `cie-${c2?.id}`);
paso(mo?.gravedad === "info" && mo.tipo === "cierre_ok" && mo.texto.startsWith("🟢 Cierre sin incidencias"), "Central: info verde en la actividad", mo?.texto ?? "no aparece");
const { data: j2 } = await admin.from("jornadas").select("fin").eq("id", c2.jornada_id).single();
paso(!!j2?.fin, "Segunda jornada finalizada");

// ── Jornada 3: golpe con parte de daños durante la jornada (grave, al momento) → la hoja de cierre lo acumula ──
if (mod("incidencias")) {
  r = await llamar(yo, "POST", "/api/conductor/jornada", { accion: "iniciar" });
  paso(r.status === 200, "Conductor inicia la tercera jornada");
  r = await llamar(yo, "POST", "/api/conductor/incidencia", { tipo: "golpe", zonas: ["puerta_del_izq", "ala_delta"], descripcion: NOTA });
  paso(r.status === 400, "Golpe con una zona inexistente → rechazado", r.j?.error ?? String(r.status));
  r = await llamar(yo, "POST", "/api/conductor/incidencia", { tipo: "golpe", zonas: [] });
  paso(r.status === 400, "Golpe sin zonas ni descripción → rechazado", r.j?.error ?? String(r.status));
  r = await llamar(yo, "POST", "/api/conductor/incidencia", { tipo: "golpe", zonas: ["aleta_tras_der", "puerta_del_izq"], descripcion: `${NOTA}: roce al maniobrar` });
  paso(r.status === 200, "Incidencia GOLPE con 2 zonas enviada", `${r.ms} ms ${r.j?.error ?? ""}`);
  const { data: g } = await admin.from("incidencias").select("id,tipo,zonas,creado_en").eq("conductor_id", yo.id).like("descripcion", `${NOTA}%`).eq("tipo", "golpe").single();
  paso(g?.zonas?.join() === "puerta_del_izq,aleta_tras_der", "Fila en incidencias con las zonas (en el orden del diagrama)", g?.zonas?.join(", ") ?? "no existe");
  r = await llamar(central, "GET", "/api/central/resumen");
  const gi = (r.j?.graves ?? []).find((m) => m.id === `inc-${g?.id}`);
  paso(!!gi && gi.zonasDanadas?.length === 2 && gi.texto.startsWith("⚠ GOLPE"), "Central: GOLPE grave (tarjeta roja) con las zonas", gi?.texto ?? "no aparece");
  // Precarga de la hoja de cierre: el conductor lee sus incidencias de hoy (RLS).
  const { data: mias } = await yo.sb.from("incidencias").select("tipo,zonas").eq("id", g.id);
  paso(mias?.[0]?.zonas?.length === 2, "RLS: el conductor ve las zonas de su golpe (precarga de la hoja)");
  const id3 = randomUUID();
  r = await llamar(yo, "POST", "/api/conductor/cierre", { idAccion: id3, vehiculo_id: veh.id, zonas: [...g.zonas, "capo"], tecnico: tecnico(), combustible: "lleno", comentario: NOTA });
  paso(r.status === 200 && r.j?.gravedad === "grave", "Hoja de cierre con las zonas del golpe + una nueva → GRAVE", `${r.ms} ms ${r.j?.error ?? ""}`);
  const { data: c3 } = await admin.from("cierres_jornada").select("id,zonas").eq("id_accion", id3).single();
  paso(c3?.zonas?.join() === "capo,puerta_del_izq,aleta_tras_der", "El cierre guarda todo lo acumulado", c3?.zonas?.join(", ") ?? "no existe");
  r = await llamar(central, "POST", "/api/central/incidencia-resuelta", { incidenciaId: g.id });
  paso(r.status === 200, "Central marca el golpe como resuelto");
} else console.log("(módulo «incidencias» desactivado: no se prueba el golpe)");

// Limpieza suave: nada se borra. Cierres vistos; km restaurados si nadie más los ha cambiado.
await admin.from("cierres_jornada").update({ visto: true }).like("comentario", `${NOTA}%`);
await admin.from("incidencias").update({ resuelta: true, resuelta_en: new Date().toISOString() }).eq("conductor_id", yo.id).like("descripcion", `${NOTA}%`).eq("resuelta", false);
await admin.from("vehiculos").update({ km_actuales: kmAntes }).eq("id", veh.id).eq("km_actuales", kmAntes + 1);
await Promise.all([central, yo].map((s) => s.sb.auth.signOut().catch(() => {})));
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
