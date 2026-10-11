import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { leerModulos, type EstadoModulos } from "@/lib/dominio/modulos";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import type { Jornada } from "@/lib/dominio/jornada";

/** Estado de los módulos leído con la sesión del operador. */
export async function modulosCentral(): Promise<EstadoModulos> {
  const sb = await clienteServidor();
  const { data } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  return leerModulos(data?.modulos);
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Rango de días (Madrid) del filtro; por defecto los últimos 7 días. Máx. 93 días. */
export function rangoDias(q: { desde?: string; hasta?: string }) {
  const hoy = diaMadrid(new Date());
  let hasta = q.hasta && DIA.test(q.hasta) ? q.hasta : hoy;
  let desde = q.desde && DIA.test(q.desde) ? q.desde : sumarDias(hasta, -6);
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
    sb.from("perfiles").select("id,nombre").eq("rol", "conductor"),
  ]);
  if (j.error) throw new Error(`Jornadas: ${j.error.message}`);
  const nombres = new Map((p.data ?? []).map((x) => [x.id as string, x.nombre as string]));
  return { jornadas: (j.data ?? []) as Jornada[], nombre: (id: string) => nombres.get(id) ?? "Conductor" };
}
