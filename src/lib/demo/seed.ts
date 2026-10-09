import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { diaMadrid, duracionEstimadaMin } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import { RUTAS_DEMO } from "./rutas";
import { DOMINIO_DEMO, FOTOS_TICKET, LUGARES_DEMO, SERVICIOS_DEMO, USUARIOS_DEMO, VEHICULOS_DEMO } from "./datos";

function ok<T>(r: { data?: T; error: { message: string } | null }, ctx: string): T {
  if (r.error) throw new Error(`Demo (${ctx}): ${r.error.message}`);
  return r.data as T;
}

async function usuariosDemoExistentes(sb: SupabaseClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw new Error(`Demo (listUsers): ${error.message}`);
    for (const u of data.users) if (u.email?.endsWith(DOMINIO_DEMO)) ids.set(u.email, u.id);
    if (data.users.length < 200) return ids;
  }
}

async function limpiar(sb: SupabaseClient, viejos: Map<string, string>): Promise<void> {
  for (const t of ["eventos_servicio", "acciones_procesadas", "servicios", "tickets_combustible", "posiciones", "posicion_actual", "perfiles"]) {
    const col = t === "posicion_actual" ? "conductor_id" : "id";
    ok(await sb.from(t).delete().not(col, "is", null), `borrar ${t}`);
  }
  // Los usuarios demo vigentes se conservan (mismo id: no se cierran sesiones); solo se borran los sobrantes.
  const vigentes = new Set(USUARIOS_DEMO.map((u) => u.email));
  for (const [email, id] of viejos) {
    const { data: fotos } = await sb.storage.from("tickets").list(id);
    if (fotos?.length) await sb.storage.from("tickets").remove(fotos.map((f) => `${id}/${f.name}`));
    if (vigentes.has(email)) continue;
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) throw new Error(`Demo (deleteUser): ${error.message}`);
  }
  ok(await sb.from("vehiculos").delete().not("id", "is", null), "borrar vehiculos");
  ok(await sb.from("lugares_frecuentes").delete().not("id", "is", null), "borrar lugares");
}

async function passwordVigente(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return true;
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (!error) await c.auth.signOut({ scope: "local" });
  return !error;
}

const redondea = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Idempotente: borra los datos de demo y los vuelve a crear con fechas relativas a `hoy`. */
export async function sembrarDemo(sb: SupabaseClient, password: string, hoy: Date = new Date()): Promise<void> {
  // Se leen las fotos antes de borrar nada: si falta un fichero, falla sin tocar los datos.
  const fotos = await Promise.all(FOTOS_TICKET.map((f) => readFile(path.join(process.cwd(), "public", "demo", f.fichero))));
  const existentes = await usuariosDemoExistentes(sb);
  await limpiar(sb, existentes);

  const vehiculos = ok(await sb.from("vehiculos").insert(
    VEHICULOS_DEMO.map((v) => ({ matricula: v.matricula, modelo: v.modelo, plazas: v.plazas, km_actuales: v.km })),
  ).select("id,matricula"), "vehiculos") as { id: string; matricula: string }[];
  const vehPorMatricula = new Map(vehiculos.map((v) => [v.matricula, v.id]));

  const perfiles: { id: string; nombre: string; rol: string; vehiculo: string | null }[] = [];
  for (const u of USUARIOS_DEMO) {
    let id = existentes.get(u.email);
    if (id) {
      // No se toca la contraseña (invalidaría las sesiones); solo si ya no coincide con la de demo.
      if (!(await passwordVigente(u.email, password))) {
        const { error } = await sb.auth.admin.updateUserById(id, { password, email_confirm: true });
        if (error) throw new Error(`Demo (updateUser ${u.nombre}): ${error.message}`);
      }
    } else {
      const { data, error } = await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Demo (createUser ${u.nombre}): ${error?.message}`);
      id = data.user.id;
    }
    const vehiculoId = u.vehiculo ? vehPorMatricula.get(u.vehiculo)! : null;
    ok(await sb.from("perfiles").insert({ id, rol: u.rol, nombre: u.nombre, telefono: u.telefono, vehiculo_habitual_id: vehiculoId }), `perfil ${u.nombre}`);
    perfiles.push({ id, nombre: u.nombre, rol: u.rol, vehiculo: vehiculoId });
  }
  const operador = perfiles.find((p) => p.rol === "operador")!;
  const conductores = perfiles.filter((p) => p.rol === "conductor");

  const lugares = ok(await sb.from("lugares_frecuentes").insert(LUGARES_DEMO).select("nombre,lat,lng"), "lugares") as { nombre: string; lat: number; lng: number }[];
  const lugar = (n: string) => lugares.find((l) => l.nombre === n)!;

  // Servicios
  const dia = (d: number) => diaMadrid(new Date(hoy.getTime() + d * 86400e3));
  const ahora = hoy.toISOString();
  const filas = SERVICIOS_DEMO.map((s, i) => {
    const o = lugar(s.origen), d = lugar(s.destino), c = s.conductor != null ? conductores[s.conductor] : null;
    const conAsignacion = c != null;
    return {
      id: crypto.randomUUID(),
      cliente_nombre: `Cliente${i + 1}`, cliente_apellidos: "Ejemplo", cliente_email: `cliente${i + 1}@ejemplo.test`,
      cliente_telefono: `600 000 0${String(10 + i).padStart(2, "0")}`,
      origen_texto: o.nombre, origen_lat: o.lat, origen_lng: o.lng, destino_texto: d.nombre, destino_lat: d.lat, destino_lng: d.lng,
      fecha_hora_recogida: madridAUtc(dia(s.dia), s.hora), pasajeros: s.pax, maletas: s.maletas,
      tipo_vehiculo_pedido: s.tipo ?? (s.pax > 4 ? "minivan" : "sedan"), numero_vuelo: s.vuelo ?? null, notas: s.notas ?? null,
      origen_pedido: i % 3 === 0 ? "manual" : "web",
      conductor_id: c?.id ?? null, vehiculo_id: c?.vehiculo ?? null, estado: s.estado,
      asignado_en: conAsignacion ? (s.estado === "asignado" ? ahora : new Date(hoy.getTime() - 3600e3).toISOString()) : null,
      duracion_estimada_min: duracionEstimadaMin({ lat: o.lat, lng: o.lng }, { lat: d.lat, lng: d.lng }),
      plazo_respuesta_min: s.estado === "asignado" ? 100000 : 15, // que el cron no expire las asignaciones de demo
      subcontratar: s.subcontratar ?? false,
      ultima_incidencia: s.rechazo ? `rechazado: ${s.rechazo}` : null,
      incidencia_vista: s.rechazo ? false : true,
    };
  });
  ok(await sb.from("servicios").insert(filas), "servicios");
  // Reserva con vuelta: enlaza ida y vuelta
  for (const [i, s] of SERVICIOS_DEMO.entries()) {
    if (s.vueltaDe == null) continue;
    ok(await sb.from("servicios").update({ servicio_vuelta_id: filas[i].id }).eq("id", filas[s.vueltaDe].id), "vuelta");
  }

  // Eventos coherentes con el estado
  const secuencia: Record<string, string[]> = {
    pendiente: ["creado"], asignado: ["creado", "asignado"], aceptado: ["creado", "asignado", "aceptado"],
    en_camino: ["creado", "asignado", "aceptado", "en_camino"], recogido: ["creado", "asignado", "aceptado", "en_camino", "recogido"],
    completado: ["creado", "asignado", "aceptado", "en_camino", "recogido", "completado"],
  };
  const eventos: { servicio_id: string; tipo: string; actor_id: string; creado_en: string; motivo?: string }[] = [];
  SERVICIOS_DEMO.forEach((s, i) => {
    // El conductor que rechazó (el servicio vuelve a pendiente sin conductor) es el actor del evento.
    const cond = s.conductor != null ? conductores[s.conductor] : s.rechazo ? conductores[i % 3] : null;
    const inicio = new Date(hoy.getTime() - (s.dia === -1 ? 20 : 4) * 3600e3 - i * 60e3);
    const tipos = s.rechazo ? ["creado", "asignado", "rechazado"] : secuencia[s.estado] ?? ["creado"];
    for (const [k, t] of tipos.entries()) {
      const delOperador = t === "creado" || t === "asignado";
      eventos.push({
        servicio_id: filas[i].id, tipo: t, actor_id: delOperador || !cond ? operador.id : cond.id,
        creado_en: new Date(inicio.getTime() + k * 7 * 60e3).toISOString(),
        ...(t === "rechazado" ? { motivo: s.rechazo } : {}),
      });
    }
  });
  ok(await sb.from("eventos_servicio").insert(eventos), "eventos");

  // Tickets de combustible: 8 en ~2 meses, km crecientes por vehículo
  const kmPorVehiculo = new Map(VEHICULOS_DEMO.map((v) => [v.matricula, v.km - 6 * 650]));
  const tickets = [];
  for (let i = 0; i < 8; i++) {
    const c = conductores[i % 3];
    const matricula = USUARIOS_DEMO.find((u) => u.nombre === c.nombre)!.vehiculo!;
    const km = kmPorVehiculo.get(matricula)! + 650 + (i % 5) * 20;
    kmPorVehiculo.set(matricula, km);
    const foto = FOTOS_TICKET[i];
    const litros = foto?.litros ?? redondea(36 + i * 1.7, 2), precio = foto?.precio ?? redondea(1.449 + (i % 4) * 0.01, 3);
    tickets.push({
      conductor_id: c.id, vehiculo_id: c.vehiculo!, fecha: foto?.fecha ?? dia(-(8 + (7 - i) * 7)),
      gasolinera: "ESTACION DEMO COSTA DORADA", litros, precio_litro: precio, importe: foto?.importe ?? redondea(litros * precio, 2),
      tipo_combustible: "Diésel", km, foto_path: null as string | null,
    });
  }
  for (const [i, f] of FOTOS_TICKET.entries()) {
    const ruta = `${tickets[i].conductor_id}/${f.fichero}`;
    const { error } = await sb.storage.from("tickets").upload(ruta, fotos[i], { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`Demo (foto ${f.fichero}): ${error.message}`);
    tickets[i].foto_path = ruta;
  }
  ok(await sb.from("tickets_combustible").insert(tickets), "tickets");
  for (const v of VEHICULOS_DEMO) {
    ok(await sb.from("vehiculos").update({ km_actuales: kmPorVehiculo.get(v.matricula)! }).eq("matricula", v.matricula), "km");
  }

  // Posiciones iniciales cerca de Salou para que el mapa no esté vacío
  const inicio = conductores.map((c) => {
    const ruta = RUTAS_DEMO[c.nombre];
    const p = ruta[c.nombre === "Marc Demo" ? 12 : c.nombre === "Laia Demo" ? 0 : ruta.length - 1]; // cerca de Salou, sin solaparse
    return { conductor_id: c.id, lat: p.lat, lng: p.lng, velocidad: 0, en_servicio: true, registrado_en: ahora };
  });
  ok(await sb.from("posicion_actual").insert(inicio), "posicion_actual");
}
