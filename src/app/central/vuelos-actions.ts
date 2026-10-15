"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";
import { madridAUtc } from "@/lib/dominio/dias";
import { normalizarVuelo, vueloVacio, MENSAJE_VUELO, calcularNuevaRecogida, admiteReajuste, horaMadrid, utcALocalMadrid } from "@/lib/dominio/vuelos";
import type { EstadoServicio } from "@/lib/dominio/tipos";
import { notificarConductor } from "@/lib/push";
import { proveedorVuelos } from "@/lib/vuelos";

type Res = { ok: boolean; mensaje: string; propuesta?: string | null; llegada?: string };
const ID = /^[0-9a-f-]{36}$/i;
const INACTIVO: Res = { ok: false, mensaje: "El módulo de vuelos está desactivado" };

async function contexto(servicioId: string) {
  const yo = await exigirRol("operador");
  if (!ID.test(servicioId)) return null;
  const sb = clienteAdmin();
  const [{ data: aj }, { data: s }] = await Promise.all([
    sb.from("ajustes").select("modulos, margen_equipaje_min").eq("id", 1).maybeSingle(),
    sb.from("servicios").select("id, estado, numero_vuelo, fecha_hora_recogida, hora_llegada_real").eq("id", servicioId).maybeSingle(),
  ]);
  if (!s) return null;
  return { yo, sb, s: s as { id: string; estado: EstadoServicio; numero_vuelo: string | null; fecha_hora_recogida: string; hora_llegada_real: string | null },
    activo: leerModulos(aj?.modulos).vuelos, margen: (aj?.margen_equipaje_min as number | undefined) ?? 20 };
}

export async function guardarNumeroVuelo(servicioId: string, numero: string): Promise<Res> {
  const c = await contexto(servicioId);
  if (!c) return { ok: false, mensaje: "Servicio no encontrado" };
  if (!c.activo) return INACTIVO;
  const n = vueloVacio(numero) ? null : normalizarVuelo(numero);
  if (!vueloVacio(numero) && !n) return { ok: false, mensaje: MENSAJE_VUELO };
  const { error } = await c.sb.from("servicios").update({ numero_vuelo: n }).eq("id", servicioId);
  if (error) return { ok: false, mensaje: "No se pudo guardar" };
  revalidatePath("/central", "layout");
  return { ok: true, mensaje: n ? `Vuelo ${n} guardado` : "Vuelo eliminado" };
}

/** Guarda la hora real de llegada (local de Madrid «YYYY-MM-DDTHH:MM») y devuelve la recogida propuesta. */
export async function guardarLlegadaReal(servicioId: string, local: string): Promise<Res> {
  const c = await contexto(servicioId);
  if (!c) return { ok: false, mensaje: "Servicio no encontrado" };
  if (!c.activo) return INACTIVO;
  if (!admiteReajuste(c.s.estado)) return { ok: false, mensaje: "El servicio ya no admite cambios" };
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(local);
  if (!m) return { ok: false, mensaje: "Hora de llegada no válida" };
  const llegada = madridAUtc(m[1], m[2]);
  const { error } = await c.sb.from("servicios").update({ hora_llegada_real: llegada }).eq("id", servicioId);
  if (error) return { ok: false, mensaje: "No se pudo guardar" };
  const vuelo = c.s.numero_vuelo ? `Vuelo ${c.s.numero_vuelo}` : "Vuelo";
  await c.sb.from("eventos_servicio").insert({ servicio_id: servicioId, tipo: "llegada_vuelo", actor_id: c.yo.id, motivo: `${vuelo}: llegada ${horaMadrid(llegada)}` });
  after(() => notificarConductor(servicioId, "Llegada del vuelo", `${vuelo} llega a las ${horaMadrid(llegada)}`, "llegada_vuelo"));
  revalidatePath("/central", "layout");
  const p = calcularNuevaRecogida({ llegadaReal: new Date(llegada), margenMin: c.margen, recogidaActual: new Date(c.s.fecha_hora_recogida), estado: c.s.estado });
  return { ok: true, mensaje: "Llegada guardada", propuesta: p?.toISOString() ?? null };
}

/** Mueve la recogida a llegada real + margen (recalculado en servidor; `esperada` confirma lo que vio el operador). */
export async function moverRecogidaPorVuelo(servicioId: string, esperada: string): Promise<Res> {
  const c = await contexto(servicioId);
  if (!c) return { ok: false, mensaje: "Servicio no encontrado" };
  if (!c.activo) return INACTIVO;
  if (!c.s.hora_llegada_real) return { ok: false, mensaje: "Falta la hora real de llegada" };
  const p = calcularNuevaRecogida({ llegadaReal: new Date(c.s.hora_llegada_real), margenMin: c.margen, recogidaActual: new Date(c.s.fecha_hora_recogida), estado: c.s.estado });
  if (!p) return { ok: false, mensaje: "No hay nada que reajustar" };
  if (p.toISOString() !== esperada) return { ok: false, mensaje: "Los datos han cambiado; vuelve a revisar la propuesta" };
  const antes = horaMadrid(c.s.fecha_hora_recogida);
  const { data: movidos, error } = await c.sb.from("servicios").update({ fecha_hora_recogida: p.toISOString() }).eq("id", servicioId)
    .not("estado", "in", "(recogido,completado,cancelado,subcontratado)").select("id");
  if (error) return { ok: false, mensaje: "No se pudo mover la recogida" };
  // 0 filas: el conductor ya recogió (o se cerró) mientras tanto → ni evento, ni push, ni «Recogida movida».
  if (!movidos?.length) return { ok: false, mensaje: "No se ha movido: el servicio ya está recogido o cerrado" };
  await c.sb.from("eventos_servicio").insert({ servicio_id: servicioId, tipo: "recogida_reajustada", actor_id: c.yo.id, motivo: `${antes} → ${horaMadrid(p)}` });
  after(() => notificarConductor(servicioId, "Recogida reajustada", `Nueva hora de recogida: ${horaMadrid(p)} (antes ${antes})`, "recogida_reajustada"));
  revalidatePath("/central", "layout");
  return { ok: true, mensaje: `Recogida movida a ${horaMadrid(p)}` };
}

/** Consulta automática (solo si hay AERODATABOX_API_KEY). Devuelve la llegada en hora local para el formulario. */
export async function consultarLlegadaAuto(servicioId: string): Promise<Res> {
  const c = await contexto(servicioId);
  if (!c) return { ok: false, mensaje: "Servicio no encontrado" };
  if (!c.activo) return INACTIVO;
  const prov = proveedorVuelos();
  if (!prov) return { ok: false, mensaje: "Consulta automática no configurada" };
  if (!c.s.numero_vuelo) return { ok: false, mensaje: "El servicio no tiene nº de vuelo" };
  const info = await prov.consultarLlegada(c.s.numero_vuelo, utcALocalMadrid(c.s.fecha_hora_recogida).slice(0, 10));
  const t = info?.real ?? info?.programada;
  if (!t) return { ok: false, mensaje: "Sin datos del vuelo" };
  return { ok: true, mensaje: `${prov.nombre}: ${info?.real ? "llegada real/estimada" : "llegada programada"}${info?.estado ? ` (${info.estado})` : ""}`, llegada: utcALocalMadrid(t) };
}
