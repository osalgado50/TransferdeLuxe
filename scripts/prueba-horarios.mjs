// Prueba de punta a punta contra producción de los HORARIOS de los conductores (datos de prueba creados aquí; nunca toca
// otros). Usa conductor4 (sin jornada, sin servicios y sin posición): se comprueba antes y, si tiene actividad, se aborta.
// Su horario de prueba es SOLO para mañana (jornada partida 08:00–13:00 · 16:00–20:00 con el vehículo del turno 0004):
// hoy queda «libre», así que el vigilante no puede avisar de «sin iniciar jornada» ni de «fin de turno» por esta prueba.
// (1) RLS: la central crea plantilla y horario; el conductor lee el suyo pero no escribe ni ve las alertas.
// (2) Sugerencia: servicio de mañana a las 10:00 → apto «En turno (08:00–13:00)» con el vehículo del turno; a las 14:00 →
//     «Fuera de horario (pausa 13:00–16:00)»; a las 19:30 hacia Barcelona → «No vuelve a la base antes de las 20:00».
//     Cambio de un día (libre mañana) → «Fuera de horario (libre ese día · …)».
// (3) Asignación automática: propone el de las 10:00 y no los otros dos (con su motivo).
// (4) Asignar a mano el de las 14:00: el servidor no lo impide, lo registra («fuera_horario: …») y pone el vehículo del
//     turno; el vigilante crea UNA alerta «servicio fuera de horario» (sin push: notas «PRUEBA AUTOMÁTICA») que sale en
//     /api/central/resumen; el de las 10:00, asignado dentro de horario, no genera alerta.
// Limpieza: servicios es_prueba + cancelados, alertas/horario/excepción/plantilla de prueba borrados y base restaurada.
// Uso: set -a; . ./.env.local; set +a; node scripts/prueba-horarios.mjs
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
const diaMadrid = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** Hora de Madrid de mañana → ISO (con el desfase actual; vale salvo el día del cambio de hora). */
const manana = (hhmm) => {
  const d = diaMadrid(new Date(Date.now() + 86400e3));
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value.replace("GMT", "") || "+0";
  const [h, m = "00"] = off.replace("+", "").replace("-", "").split(":");
  return new Date(`${d}T${hhmm}:00${off.startsWith("-") ? "-" : "+"}${h.padStart(2, "0")}:${m}`).toISOString();
};
const diaSemana = (dia) => { const d = new Date(`${dia}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

const SALOU = { origen_texto: "Salou – Plaza Europa, Salou", origen_lat: 41.076, origen_lng: 1.14 };
const REUS = { destino_texto: "Aeropuerto de Reus", destino_lat: 41.1474, destino_lng: 1.1672 };
const BCN = { destino_texto: "Barcelona – Plaça de Catalunya", destino_lat: 41.3874, destino_lng: 2.1686 };
const BASE = { base_texto: `Salou – Plaza Europa (${NOTA})`, base_lat: 41.076, base_lng: 1.14 };
const CLIENTE = { cliente_nombre: "Prueba", cliente_apellidos: "Automática", cliente_email: "prueba-horarios@transferdeluxe.test", cliente_telefono: "600000000" };
const PARTIDO = [{ inicio: "08:00", fin: "13:00" }, { inicio: "16:00", fin: "20:00" }];
const creados = [];
async function crear(iso, extra = {}) {
  const { data, error } = await admin.from("servicios").insert({ ...CLIENTE, ...SALOU, ...REUS, pasajeros: 2, maletas: 2, tipo_vehiculo_pedido: "minivan",
    origen_pedido: "manual", estado: "pendiente", notas: NOTA, fecha_hora_recogida: iso, ...extra }).select("id").single();
  if (error) throw error;
  creados.push(data.id);
  return data.id;
}

const EMAIL = process.env.CONDUCTOR_PRUEBA ?? "conductor4@transferdeluxe.test";
const central = await sesion("central@transferdeluxe.test");
const yo = await sesion(EMAIL);
const diaManana = diaMadrid(new Date(Date.now() + 86400e3)), dsm = diaSemana(diaManana);
const { data: veh } = await admin.from("vehiculos").select("id,matricula,plazas").eq("matricula", "0004-TDL").maybeSingle();
let plantillaId = null, horarioCreado = false, excepcionCreada = false, baseAntes = null, basePuesta = false;

// Seguridad: el conductor de prueba no puede tener actividad (ni horario previo, que no es nuestro).
const [{ count: abiertas }, { count: activos }, { data: pos }, { count: previos }] = await Promise.all([
  admin.from("jornadas").select("id", { count: "exact", head: true }).eq("conductor_id", yo.id).is("fin", null),
  admin.from("servicios").select("id", { count: "exact", head: true }).eq("conductor_id", yo.id).in("estado", ["asignado", "aceptado", "en_camino", "recogido"]),
  admin.from("posicion_actual").select("registrado_en").eq("conductor_id", yo.id).maybeSingle(),
  admin.from("horarios_conductor").select("conductor_id", { count: "exact", head: true }).eq("conductor_id", yo.id),
]);
if (abiertas || activos || previos || (pos && Date.now() - Date.parse(pos.registrado_en) < 30 * 60_000) || !veh) {
  console.error(`Abortado: ${EMAIL} tiene actividad u horario propio (jornada ${abiertas}, servicios ${activos}, horario ${previos}, posición ${pos?.registrado_en ?? "—"}) o falta el vehículo 0004-TDL.`);
  process.exit(2);
}
console.log(`Conductor de prueba ${EMAIL} · mañana ${diaManana} (día ${dsm}) · vehículo del turno ${veh.matricula} · ${NOTA}\n`);

try {
  // Base / depósito (columna nueva; solo si está vacía y se deja como estaba).
  baseAntes = (await admin.from("ajustes").select("base_texto,base_lat,base_lng").eq("id", 1).single()).data;
  if (!baseAntes?.base_texto) { await admin.from("ajustes").update(BASE).eq("id", 1); basePuesta = true; }
  const base = basePuesta ? BASE : baseAntes;
  paso(!!base?.base_lat, "Base / depósito con coordenadas", base?.base_texto ?? "");

  // ── (1) RLS y alta del horario por la central ──
  const { data: pl, error: ePl } = await central.sb.from("plantillas_horario").insert({ nombre: `Partido ${NOTA}`.slice(0, 60), tramos: PARTIDO }).select("id").single();
  paso(!ePl && !!pl, "Central (RLS operador): crea la plantilla «Partido 08–13 / 16–20»", ePl?.message ?? "");
  plantillaId = pl?.id ?? null;
  const { error: eH } = await central.sb.from("horarios_conductor").insert({ conductor_id: yo.id, dia_semana: dsm, tramos: PARTIDO, vehiculo_id: veh.id, plantilla_id: plantillaId });
  horarioCreado = !eH;
  paso(!eH, "Central: semana tipo con jornada partida SOLO para mañana y vehículo del turno", eH?.message ?? "");
  const { data: suyo } = await yo.sb.from("horarios_conductor").select("dia_semana,tramos").eq("conductor_id", yo.id);
  paso((suyo ?? []).length === 1 && suyo[0].tramos.length === 2, "RLS: el conductor lee su horario");
  const { error: eEsc } = await yo.sb.from("horarios_conductor").insert({ conductor_id: yo.id, dia_semana: dsm === 7 ? 1 : dsm + 1, tramos: [] });
  paso(!!eEsc, "RLS: el conductor no puede escribir horarios", eEsc?.message ?? "¡lo permitió!");
  const { data: plC } = await yo.sb.from("plantillas_horario").select("id");
  paso((plC ?? []).length === 0, "RLS: el conductor no ve las plantillas");

  // ── (2) Sugerencia ──
  const S10 = await crear(manana("10:00")), S14 = await crear(manana("14:00")), S1930 = await crear(manana("19:30"), BCN);
  // Espera al despliegue: la sugerencia nueva trae «fueraHorario».
  let r;
  for (let i = 0; i < 60; i++) {
    r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${S10}`);
    if ((r.j?.sugerencias ?? []).some((x) => "fueraHorario" in x)) break;
    if (i === 0) console.log("… esperando al despliegue con horarios");
    await espera(10000);
  }
  const de = (rr) => (rr.j?.sugerencias ?? []).find((x) => x.conductorId === yo.id);
  let s = de(r);
  paso(!!s && s.apto === true && s.motivos.includes("En turno (08:00–13:00)") && s.vehiculoId === veh.id && s.fueraHorario === null,
    "Sugerencia 10:00: apto, «En turno (08:00–13:00)», con el vehículo del turno (0004)", s ? `${s.motivos.join(" | ")} · ${s.matricula}` : r.texto.slice(0, 200));
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${S14}`);
  s = de(r);
  paso(!!s && s.apto === false && s.motivos.includes("Fuera de horario (pausa 13:00–16:00)") && s.fueraHorario === "Fuera de horario (pausa 13:00–16:00)",
    "Sugerencia 14:00: no apto «Fuera de horario (pausa 13:00–16:00)»", s?.motivos.join(" | ") ?? "");
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${S1930}`);
  s = de(r);
  paso(!!s && s.apto === false && s.fueraHorario === "No vuelve a la base antes de las 20:00",
    "Sugerencia 19:30 a Barcelona: no apto «No vuelve a la base antes de las 20:00»", s?.motivos.join(" | ") ?? "");

  // Cambio de un día: mañana libre → manda sobre la semana tipo.
  const { error: eEx } = await central.sb.from("excepciones_horario").insert({ conductor_id: yo.id, fecha: diaManana, tramos: [], nota: "Prueba" });
  excepcionCreada = !eEx;
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${S10}`);
  s = de(r);
  paso(!eEx && !!s && s.apto === false && s.fueraHorario === "Fuera de horario (libre ese día · Prueba)", "Cambio de un día (libre): la sugerencia de las 10:00 pasa a «Fuera de horario (libre ese día · Prueba)»", s?.fueraHorario ?? eEx?.message ?? "");
  await central.sb.from("excepciones_horario").delete().eq("conductor_id", yo.id).eq("fecha", diaManana);
  excepcionCreada = false;
  r = await llamar(central, "GET", `/api/central/sugerencia?servicio=${S10}`);
  paso(de(r)?.apto === true, "Borrado el cambio: vuelve a su semana tipo (apto a las 10:00)");

  // ── (3) Asignación automática (solo propuesta: no escribe nada) ──
  r = await llamar(central, "POST", "/api/central/autoasignar/propuesta", { servicioIds: [S10, S14, S1930], conductorIds: [yo.id], estrategia: "equitativo" });
  const lin = (id) => r.j?.propuesta?.lineas?.find((l) => l.servicioId === id);
  paso(r.status === 200 && lin(S10)?.conductorId === yo.id, "Propuesta automática: el de las 10:00 al conductor en turno", JSON.stringify(lin(S10)?.motivoSiNo ?? lin(S10)?.conductorId ?? r.texto.slice(0, 160)));
  paso(lin(S14)?.conductorId === null && /pausa 13:00–16:00/.test(lin(S14)?.motivoSiNo ?? ""), "Propuesta: el de las 14:00 sin asignar (pausa)", lin(S14)?.motivoSiNo ?? "");
  paso(lin(S1930)?.conductorId === null && /No vuelve a la base antes de las 20:00/.test(lin(S1930)?.motivoSiNo ?? ""), "Propuesta: el de las 19:30 sin asignar (no vuelve a la base)", lin(S1930)?.motivoSiNo ?? "");
  r = await llamar(central, "GET", `/api/central/autoasignar/propuesta?dia=${diaManana}`);
  const cD = (r.j?.conductores ?? []).find((c) => c.id === yo.id);
  paso(cD?.turno === "Turno 08:00–13:00 · 16:00–20:00" && cD?.vehiculo?.id === veh.id, "Diálogo automático: «Turno 08:00–13:00 · 16:00–20:00» y vehículo del turno", JSON.stringify({ turno: cD?.turno, v: cD?.vehiculo?.matricula }));

  // ── (4) Asignación manual y alerta del vigilante ──
  r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: S14, conductorId: yo.id });
  const { data: evA } = await admin.from("eventos_servicio").select("motivo").eq("servicio_id", S14).eq("tipo", "asignado").maybeSingle();
  const { data: s14 } = await admin.from("servicios").select("conductor_id,vehiculo_id,estado").eq("id", S14).single();
  paso(r.status === 200 && s14.conductor_id === yo.id && evA?.motivo === "fuera_horario: Fuera de horario (pausa 13:00–16:00)",
    "Asignar a mano en la pausa: el servidor no lo impide y lo registra en el evento", evA?.motivo ?? r.texto);
  paso(s14.vehiculo_id === veh.id, "…y pone el vehículo del turno aunque no se indique", s14.vehiculo_id ?? "null");
  r = await llamar(central, "POST", "/api/central/asignar", { idAccion: randomUUID(), servicioId: S10, conductorId: yo.id });
  const { data: evB } = await admin.from("eventos_servicio").select("motivo").eq("servicio_id", S10).eq("tipo", "asignado").maybeSingle();
  paso(r.status === 200 && evB && !evB.motivo, "Asignar dentro de horario: sin marca en el evento", evB?.motivo ?? "");
  let al = [];
  for (let i = 0; i < 36 && !al.length; i++) {
    await espera(5000);
    al = (await admin.from("alertas_horario").select("id,tipo,servicio_id,texto,clave").eq("conductor_id", yo.id).in("servicio_id", [S14])).data ?? [];
  }
  paso(al.length === 1 && al[0].tipo === "fuera_horario" && /^⚠️ Servicio de las 14:00 asignado a .+ fuera de su horario · Fuera de horario \(pausa 13:00–16:00\)$/.test(al[0].texto),
    "Vigilante: UNA alerta «servicio asignado fuera de horario»", al[0]?.texto ?? "no llegó en 180 s");
  await espera(70000); // otra pasada del vigilante: no duplica
  const { data: todas } = await admin.from("alertas_horario").select("id,tipo,servicio_id").eq("conductor_id", yo.id);
  paso((todas ?? []).filter((x) => x.servicio_id === S14).length === 1, "Otra pasada del vigilante: sigue habiendo una sola (una vez por caso)");
  paso(!(todas ?? []).some((x) => x.servicio_id === S10), "El de las 10:00 (dentro de horario) no genera alerta");
  paso(!(todas ?? []).some((x) => x.tipo !== "fuera_horario"), "Sin alertas de «sin iniciar jornada» ni «fin de turno» (hoy está libre)");
  r = await llamar(central, "GET", "/api/central/resumen");
  const av = (r.j?.avisos ?? []).find((m) => m.tipo === "horario_fuera_horario" && m.servicioId === S14);
  paso(!!av && av.gravedad === "aviso" && av.alerta === true, "/api/central/resumen: tarjeta de aviso en la actividad de la central", av?.texto ?? "no aparece");
  const mov = (r.j?.actividad ?? []).find((m) => m.servicioId === S14 && m.tipo === "asignado");
  paso(!!mov && /fuera de su horario \(Fuera de horario \(pausa 13:00–16:00\)\)$/.test(mov.texto), "Actividad: «… enviado a … · fuera de su horario (…)»", mov?.texto ?? "no aparece");
  const { data: verAl } = await yo.sb.from("alertas_horario").select("id");
  paso((verAl ?? []).length === 0, "RLS: el conductor no ve las alertas de horario");
} catch (e) {
  paso(false, "Error inesperado", e instanceof Error ? e.message : String(e));
} finally {
  // Limpieza: todo lo creado aquí (y nada más).
  if (creados.length) {
    await admin.from("servicios").update({ incidencia_vista: true, es_prueba: true, estado: "cancelado" }).in("id", creados);
    await admin.from("alertas_horario").delete().in("servicio_id", creados);
  }
  await admin.from("excepciones_horario").delete().eq("conductor_id", yo.id).eq("fecha", diaManana).eq("nota", "Prueba");
  if (horarioCreado) await admin.from("horarios_conductor").delete().eq("conductor_id", yo.id).eq("dia_semana", dsm);
  if (plantillaId) await admin.from("plantillas_horario").delete().eq("id", plantillaId);
  if (basePuesta) await admin.from("ajustes").update({ base_texto: null, base_lat: null, base_lng: null }).eq("id", 1).eq("base_texto", BASE.base_texto);
  await Promise.all([central, yo].map((x) => x.sb.auth.signOut({ scope: "local" }).catch(() => {})));
  const [{ count: h }, { count: p }, { count: a }] = await Promise.all([
    admin.from("horarios_conductor").select("conductor_id", { count: "exact", head: true }).eq("conductor_id", yo.id),
    plantillaId ? admin.from("plantillas_horario").select("id", { count: "exact", head: true }).eq("id", plantillaId) : Promise.resolve({ count: 0 }),
    admin.from("alertas_horario").select("id", { count: "exact", head: true }).eq("conductor_id", yo.id),
  ]);
  console.log(`Limpieza: ${creados.length} servicio(s) de prueba cancelados (es_prueba); quedan ${h} fila(s) de horario, ${p} plantilla(s) y ${a} alerta(s) de prueba; base ${basePuesta ? "restaurada" : "sin tocar"}.`);
}
console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLO(S)`}`);
process.exit(fallos ? 1 : 0);
