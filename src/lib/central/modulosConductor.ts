import "server-only";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteServidor } from "@/lib/supabase/servidor";
import { leerModulos, type EstadoModulos } from "@/lib/dominio/modulos";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import type { Jornada } from "@/lib/dominio/jornada";
import { diaValido } from "@/lib/dominio/periodo";

/** Estado de los módulos leído con la sesión del operador. */
export async function modulosCentral(): Promise<EstadoModulos> {
  const sb = await clienteServidor();
  const { data } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  return leerModulos(data?.modulos);
}

/** Rango de días (Madrid) del filtro; por defecto los últimos 7 días. Máx. 93 días. Fechas imposibles → por defecto. */
export function rangoDias(q: { desde?: string; hasta?: string }) {
  const hoy = diaMadrid(new Date());
  let hasta = diaValido(q.hasta) ? q.hasta : hoy;
  let desde = diaValido(q.desde) ? q.desde : sumarDias(hasta, -6);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde < sumarDias(hasta, -92)) desde = sumarDias(hasta, -92);
  return { desde, hasta };
}

/** Jornadas que empiezan en [desde, hasta] (días Madrid) y nombres de conductores. */
export async function jornadasEnRango(desde: string, hasta: string) {
  const sb = await clienteServidor();
  const [j, p] = await Promise.all([
    sb.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)")
      .gte("inicio", madridAUtc(desde, "00:00")).lt("inicio", madridAUtc(sumarDias(hasta, 1), "00:00")).order("inicio"),
    sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN),
  ]);
  if (j.error) throw new Error(`Jornadas: ${j.error.message}`);
  const nombres = new Map((p.data ?? []).map((x) => [x.id as string, x.nombre as string]));
  return { jornadas: (j.data ?? []) as Jornada[], nombre: (id: string) => nombres.get(id) ?? "Conductor" };
}
