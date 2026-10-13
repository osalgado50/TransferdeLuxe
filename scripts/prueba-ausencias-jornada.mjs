// Prueba de punta a punta contra producción (servicios de PRUEBA creados aquí; nunca toca otros):
// (1) FIN DE JORNADA: conductor3 con jornada iniciada, dos servicios PRUEBA hoy por la tarde (uno aceptado, otro solo
//     asignado) y uno mañana → los de hoy salen como pendientes, los devuelve con «Fin de jornada» (devolver / rechazar),
//     finaliza con la hoja de cierre → el de mañana sigue asignado, la central ve UN movimiento agrupado y la sugerencia
//     lo marca «Jornada cerrada hoy» para hoy (no para mañana); el vigilante revisa la jornada (sin pendientes reales).
// (2) CARGA LEJOS: servicio PRUEBA en camino, posición del conductor a ~3 km del origen y CARGA → aviso en
//     /api/central/resumen (avisos y actividad) con posición; «deshacer + CARGA» no duplica; DESCARGA en el destino → nada.
// (3) AUSENCIAS: vacaciones de conductor2 mañana → sugerencia y propuesta automática lo marcan «No disponible»; tarde libre
//     de conductor3 mañana → asignarlo a mano se permite pero queda registrado en el evento («ausente: …»).
// Limpieza: servicios es_prueba + cancelados + alerta vista, ausencias de prueba borradas, conductor3 fuera de servicio.
// Las notas «PRUEBA AUTOMÁTICA…» evitan los push a la central (vigilante).
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-ausencias-jornada.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = process.env.API_URL ?? "https://app.transfersvipluxe.com";
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
  const r = await fetch(API + ruta, { method: metodo, signal: AbortSignal.timeout(20000),
    headers: { ...(s ? { authorization: `Bearer ${s.token}` } : {}), "content-type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch { /* no JSON */ }
  return { status: r.status, j, texto };
}
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const estado = async (id) => (await admin.from("servicios").select("estado,conductor_id,ultima_incidencia,incidencia_vista").eq("id", id).single()).data;
const diaMadrid = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hora = (iso) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const accion = (s, servicioId, a, motivo) => llamar(s, "POST", "/api/conductor/accion", { idAccion: randomUUID(), servicioId, accion: a, ...(motivo ? { motivo } : {}) });
/** Hora de Madrid de mañana → ISO (con el desfase actual; vale salvo el día del cambio de hora). */
const manana = (hhmm) => {
  const d = diaMadrid(new Date(Date.now() + 86400e3));
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value.replace("GMT", "") || "+0";
  const [h, m = "00"] = off.replace("+", "").replace("-", "").split(":");
  return new Date(`${d}T${hhmm}:00${off.startsWith("-") ? "-" : "+"}${h.padStart(2, "0")}:${m}`).toISOString();
};

const SALOU = { origen_texto: "Salou – Plaza Europa, Salou", origen_lat: 41.076, origen_lng: 1.14 };
const REUS = { destino_texto: "Aeropuerto de Reus", destino_lat: 41.1474, destino_lng: 1.1672 };
const CLIENTE = { cliente_nombre: "Prueba", cliente_apellidos: "Automática", cliente_email: "prueba-jornada@transferdeluxe.test", cliente_telefono: "600000000" };
const creados = [];
async function crear(iso, extra = {}) {
  const { data, error } = await admin.from("servicios").insert({ ...CLIENTE, ...SALOU, ...REUS, pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "minivan",
    origen_pedido: "manual", estado: "pendiente", notas: NOTA, fecha_hora_recogida: iso, ...extra }).select("id").single();
  if (error) throw error;
  creados.push(data.id);
  return data.id;
}
const ausenciasCreadas = [];

const central = await sesion("central@transferdeluxe.test");
const yo = await sesion("conductor3@transferdeluxe.test");
const laia = await sesion("conductor2@transferdeluxe.test");
const { data: per } = await admin.from("perfiles").select("nombre,vehiculo_habitual_id").eq("id", yo.id).single();
const { data: vehs } = await admin.from("vehiculos").select("id").eq("estado", "activo").order("matricula");
const vehiculo = per.vehiculo_habitual_id ?? vehs[0].id;
const hoy = diaMadrid(new Date()), diaManana = diaMadrid(new Date(Date.now() + 86400e3));
console.log(`Conductor ${per.nombre} · hoy ${hoy} · ${NOTA}\n`);

try {
  // ── (1) Fin de jornada ──
  const tA = new Date(Date.now() + 100 * 60_000).toISOString(), tB = new Date(Date.now() + 160 * 60_000).toISOString();
  if (diaMadrid(new Date(tB)) !== hoy) throw new Error("Demasiado tarde para la prueba (los servicios de «hoy» caerían mañana)");
  const A = await crear(tA), B = await crear(tB), C = await crear(manana("10:00"));
  let r = await llamar(yo, "POST", "/api/conductor/jornada", { accion: "iniciar" });
  paso(r.status === 200, "Conductor3: jornada iniciada", `${r.status}`);
  for (const s of [A, B, C]) {
    r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: s, conductorId: yo.id });
    if (r.status !== 200) paso(false, "Central asigna", r.texto);
  }
  for (const s of [A, C]) { r = await accion(yo, s, "aceptar"); if (r.status !== 200) paso(false, "Acepta", r.texto); }
  paso((await estado(A)).estado === "aceptado" && (await estado(B)).estado === "asignado" && (await estado(C)).estado === "aceptado",
    "Tres servicios PRUEBA: A (hoy, aceptado), B (hoy, solo asignado), C (mañana, aceptado)", `${hora(tA)}, ${hora(tB)}`);

  // Lo que consulta la app al pulsar «Finalizar jornada» (como el propio conductor, con RLS).
  const { data: mios } = await yo.sb.from("servicios").select("id,estado,fecha_hora_recogida").in("estado", ["asignado", "aceptado", "en_camino"])
    .gt("fecha_hora_recogida", new Date().toISOString()).limit(100);
  const pendHoy = (mios ?? []).filter((s) => diaMadrid(new Date(s.fecha_hora_recogida)) === hoy).map((s) => s.id);
  paso(pendHoy.includes(A) && pendHoy.includes(B) && !pendHoy.includes(C), "Pendientes de HOY al finalizar: A y B (C es de mañana, no)", `${pendHoy.length} de hoy`);

  r = await accion(yo, A, "devolver", "Fin de jornada");
  const r2 = await accion(yo, B, "rechazar", "Fin de jornada");
  const eA = await estado(A), eB = await estado(B), eC = await estado(C);
  paso(r.status === 200 && eA.estado === "pendiente" && eA.conductor_id === null && eA.ultima_incidencia === "devuelto: Fin de jornada",
    "A (aceptado) → devolver «Fin de jornada» → Sin asignar con alerta", JSON.stringify(eA));
  paso(r2.status === 200 && eB.estado === "pendiente" && eB.conductor_id === null && eB.ultima_incidencia === "rechazado: Fin de jornada",
    "B (solo asignado) → rechazar «Fin de jornada» → Sin asignar con alerta", JSON.stringify(eB));

  r = await llamar(yo, "POST", "/api/conductor/cierre", { idAccion: randomUUID(), vehiculo_id: vehiculo, zonas: [],
    tecnico: { neumaticos: "ok", aceite: "ok", refrigerante: "ok", luces: "ok", testigos_cuadro: "ok", otra_averia: "ok", testigos: [] }, combustible: "lleno", comentario: NOTA });
  const { data: abierta } = await admin.from("jornadas").select("id").eq("conductor_id", yo.id).is("fin", null).maybeSingle();
  const { data: jCerrada } = await admin.from("jornadas").select("id,fin").eq("conductor_id", yo.id).not("fin", "is", null).order("fin", { ascending: false }).limit(1).single();
  paso(r.status === 200 && !abierta, "Finaliza con la hoja de cierre (todo OK) → jornada cerrada", `${r.status} ${r.j?.gravedad ?? r.j?.error ?? ""}`);
  paso(eC.estado === "aceptado" && eC.conductor_id === yo.id && (await estado(C)).conductor_id === yo.id, "C (mañana) sigue asignado a conductor3", JSON.stringify(await estado(C)));

  r = await llamar(central, "GET", "/api/central/resumen");
  const grupo = (r.j?.actividad ?? []).find((m) => m.tipo === "devuelto_fin_jornada" && m.conductorId === yo.id);
  paso(!!grupo && /^🔁 .+ ha terminado la jornada y ha devuelto 2 servicios de esta tarde$/.test(grupo.texto)
    && !(r.j?.actividad ?? []).some((m) => [A, B].includes(m.servicioId) && (m.tipo === "devuelto" || m.tipo === "rechazado")),
    "Central: UN aviso agrupado «… ha terminado la jornada y ha devuelto 2 servicios de esta tarde»", grupo?.texto ?? "no aparece");
  paso((r.j?.alertas ?? []).some((x) => x.id === A) && (r.j?.alertas ?? []).some((x) => x.id === B), "Central: A y B en alertas para reasignar");

  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${A}`);
  const sgA = (r.j?.sugerencias ?? []).find((x) => x.conductorId === yo.id);
  paso(!!sgA && sgA.apto === false && sgA.motivos.includes("Jornada cerrada hoy"), "Sugerencia para HOY: conductor3 «Jornada cerrada hoy» (no apto)", sgA?.motivos.join(" | ") ?? "");
  const D = await crear(manana("12:00"));
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${D}`);
  const sgD = (r.j?.sugerencias ?? []).find((x) => x.conductorId === yo.id);
  paso(!!sgD && !sgD.motivos.includes("Jornada cerrada hoy"), "Sugerencia para MAÑANA: conductor3 sin «Jornada cerrada hoy»", sgD?.motivos.join(" | ") ?? "");

  // ── (3) Ausencias ── (antes de esperar al vigilante, para aprovechar el tiempo)
  const { data: aus2, error: eAus } = await central.sb.from("ausencias").insert({ conductor_id: laia.id, desde: diaManana, hasta: diaManana, franja: "dia",
    tipo: "vacaciones", nota: NOTA, creado_por: central.id }).select("id").single();
  paso(!eAus && !!aus2, "Central (RLS operador): vacaciones de conductor2 mañana", eAus?.message ?? "");
  if (aus2) ausenciasCreadas.push(aus2.id);
  const { data: verOtro } = await yo.sb.from("ausencias").select("id").eq("conductor_id", laia.id);
  const { data: verSuya } = await laia.sb.from("ausencias").select("id").eq("conductor_id", laia.id);
  paso((verOtro ?? []).length === 0 && (verSuya ?? []).some((x) => x.id === aus2?.id), "RLS: conductor2 ve su ausencia; conductor3 no la ve");
  const { error: eEscribe } = await laia.sb.from("ausencias").insert({ conductor_id: laia.id, desde: diaManana, hasta: diaManana, tipo: "libre" });
  paso(!!eEscribe, "RLS: un conductor no puede crear ausencias", eEscribe?.message ?? "¡lo permitió!");
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${D}`);
  const sgL = (r.j?.sugerencias ?? []).find((x) => x.conductorId === laia.id);
  paso(!!sgL && sgL.apto === false && sgL.motivos.includes("No disponible · vacaciones") && sgL.ausencia?.tipo === "vacaciones",
    "Sugerencia (mañana): conductor2 «No disponible · vacaciones»", sgL?.motivos.join(" | ") ?? "");
  r = await llamar(central, "POST", "/api/central/autoasignar/propuesta", { servicioIds: [D], conductorIds: [laia.id], estrategia: "equitativo" });
  const lin = r.j?.propuesta?.lineas?.[0];
  paso(r.status === 200 && lin && lin.conductorId === null && /No disponible · vacaciones/.test(lin.motivoSiNo ?? ""),
    "Asignación automática: no propone a conductor2 («No disponible · vacaciones»)", lin?.motivoSiNo ?? r.texto.slice(0, 200));
  r = await llamar(central, "GET", `/api/central/autoasignar/propuesta?dia=${diaManana}`);
  const cL = (r.j?.conductores ?? []).find((c) => c.id === laia.id);
  paso(!!cL && cL.noDisponible === "No disponible · vacaciones" && cL.marcado === false, "Diálogo de asignación automática: conductor2 desmarcado y «No disponible · vacaciones»", JSON.stringify(cL?.noDisponible));

  const { data: aus3 } = await central.sb.from("ausencias").insert({ conductor_id: yo.id, desde: diaManana, hasta: diaManana, franja: "tarde",
    tipo: "libre", nota: NOTA, creado_por: central.id }).select("id").single();
  if (aus3) ausenciasCreadas.push(aus3.id);
  const G = await crear(manana("17:00"));
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${G}`);
  const sgG = (r.j?.sugerencias ?? []).find((x) => x.conductorId === yo.id);
  paso(!!sgG && sgG.apto === false && sgG.motivos.includes("No disponible · día libre (tarde)"), "Tarde libre de conductor3 mañana: servicio de las 17:00 → «No disponible · día libre (tarde)»", sgG?.motivos.join(" | ") ?? "");
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${D}`);
  paso(!((r.j?.sugerencias ?? []).find((x) => x.conductorId === yo.id)?.motivos ?? []).some((m) => m.startsWith("No disponible")), "…y el de las 12:00 (mañana) no se bloquea");
  r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: G, conductorId: yo.id });
  const { data: evG } = await admin.from("eventos_servicio").select("motivo").eq("servicio_id", G).eq("tipo", "asignado").maybeSingle();
  paso(r.status === 200 && evG?.motivo === "ausente: día libre (tarde)", "Asignar a mano a un ausente: el servidor no lo impide y lo registra en el evento", evG?.motivo ?? r.texto);

  // ── (2) CARGA lejos del punto ──
  const E = await crear(new Date(Date.now() + 20 * 60_000).toISOString());
  r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: E, conductorId: yo.id });
  await accion(yo, E, "aceptar"); await accion(yo, E, "salir");
  const lejos = { lat: SALOU.origen_lat + 0.027, lng: SALOU.origen_lng }; // ~3 km al norte de la recogida
  const { error: ePos } = await yo.sb.from("posiciones").insert({ conductor_id: yo.id, ...lejos, velocidad: 0, precision_m: 10, registrado_en: new Date().toISOString() });
  paso(!ePos, "Posición del conductor a ~3 km de la recogida", ePos?.message ?? "");
  r = await accion(yo, E, "cargar");
  paso(r.status === 200 && (await estado(E)).estado === "recogido", "Conductor marca CARGA lejos de la recogida");
  let an = null;
  for (let i = 0; i < 30 && !an; i++) { await espera(5000); an = (await admin.from("eventos_servicio").select("id,motivo,actor_id").eq("servicio_id", E).eq("tipo", "anomalia_carga").maybeSingle()).data; }
  paso(!!an && an.actor_id === yo.id && /^d=(2[5-9]|3[0-4])\d\d;/.test(an.motivo), "Vigilante: evento «anomalia_carga» (distancia ~3 km y posición)", an?.motivo ?? "no llegó en 150 s");
  r = await llamar(central, "GET", "/api/central/resumen");
  const av = (r.j?.avisos ?? []).find((m) => m.servicioId === E && m.tipo === "anomalia_carga");
  paso(!!av && /^⚠️ .+ ha marcado CARGA a [23],\d km de la recogida \(Salou – Plaza Europa\) · está /.test(av.texto) && av.lat != null && av.lng != null && av.alerta === true,
    "/api/central/resumen: aviso «⚠️ … ha marcado CARGA a X km de la recogida (…) · está …» con posición (Ver en el mapa) y teléfono", `${av?.texto ?? "no aparece"} · tel ${av?.telefono ? "sí" : "no"}`);
  r = await accion(yo, E, "deshacer");
  const r3 = await accion(yo, E, "cargar");
  paso(r.status === 200 && r3.status === 200, "Deshacer + CARGA otra vez", `${r.status}/${r3.status}`);
  await yo.sb.from("posiciones").insert({ conductor_id: yo.id, lat: REUS.destino_lat, lng: REUS.destino_lng, velocidad: 0, precision_m: 10, registrado_en: new Date().toISOString() });
  r = await accion(yo, E, "descargar");
  await espera(45000);
  const { count: nCarga } = await admin.from("eventos_servicio").select("id", { count: "exact", head: true }).eq("servicio_id", E).eq("tipo", "anomalia_carga");
  const { count: nDesc } = await admin.from("eventos_servicio").select("id", { count: "exact", head: true }).eq("servicio_id", E).eq("tipo", "anomalia_descarga");
  paso(nCarga === 1, "Una sola alerta de CARGA por servicio (la segunda CARGA no duplica)", `${nCarga}`);
  paso(r.status === 200 && nDesc === 0, "DESCARGA en el destino → sin alerta", `${nDesc}`);

  // Red de seguridad: el vigilante revisa la jornada cerrada (2 min de gracia) → sin pendientes reales (los de prueba no cuentan).
  let rev = null;
  for (let i = 0; i < 30 && !rev?.pendientes_revisada_en; i++) {
    rev = (await admin.from("jornadas").select("pendientes_revisada_en,pendientes_cierre").eq("id", jCerrada.id).single()).data;
    if (!rev?.pendientes_revisada_en) await espera(5000);
  }
  paso(!!rev?.pendientes_revisada_en && Array.isArray(rev.pendientes_cierre) && rev.pendientes_cierre.length === 0,
    "Vigilante: jornada cerrada revisada una vez, sin servicios pendientes reales", JSON.stringify(rev));
} catch (e) {
  paso(false, "Error inesperado", e instanceof Error ? e.message : String(e));
} finally {
  // Limpieza suave: servicios de prueba vistos, es_prueba y cancelados; ausencias de prueba borradas (son de esta prueba).
  if (creados.length) await admin.from("servicios").update({ incidencia_vista: true, es_prueba: true, estado: "cancelado" }).in("id", creados);
  if (ausenciasCreadas.length) await admin.from("ausencias").delete().in("id", ausenciasCreadas);
  await llamar(yo, "POST", "/api/conductor/fuera-de-servicio").catch(() => {});
  await Promise.all([central, yo, laia].map((x) => x.sb.auth.signOut({ scope: "local" }).catch(() => {})));
  console.log(`Limpieza: ${creados.length} servicio(s) de prueba cancelados, ${ausenciasCreadas.length} ausencia(s) borradas, conductor3 fuera de servicio.`);
}
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
