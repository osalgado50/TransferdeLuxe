import { clienteServidor } from "@/lib/supabase/servidor";
import { leerModulos } from "@/lib/dominio/modulos";
import { rangosJornada, type Jornada } from "@/lib/dominio/jornada";
import { debePedirChecklist, itemsActivos, type ItemChecklist } from "@/lib/dominio/checklist";
import { diaMadrid } from "@/lib/dominio/geo";
import type { Perfil } from "@/lib/dominio/tipos";
import JornadaConductor from "./JornadaConductor";
import BotonIncidencia from "./BotonIncidencia";
import ChecklistVehiculo from "./ChecklistVehiculo";

/** Bloque de módulos opcionales en la pantalla principal del conductor (solo los activos en la central). */
export default async function ModulosConductor({ yo }: { yo: Perfil }) {
  const sb = await clienteServidor();
  const { data: aj } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  const m = leerModulos(aj?.modulos);
  if (!m.jornada && !m.incidencias && !m.checklist) return null;
  const r = rangosJornada(new Date());
  const [jor, items, revs, vehs] = await Promise.all([
    m.jornada || m.checklist
      ? sb.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").eq("conductor_id", yo.id)
          .or(`fin.is.null,fin.gte.${r.semana.desde}`).order("inicio")
      : Promise.resolve({ data: [] }),
    m.checklist ? sb.from("checklist_items").select("id,texto,orden,activo") : Promise.resolve({ data: [] }),
    m.checklist ? sb.from("checklist_revisiones").select("vehiculo_id").eq("conductor_id", yo.id).eq("fecha", diaMadrid(new Date())) : Promise.resolve({ data: [] }),
    m.checklist ? sb.from("vehiculos").select("id,matricula,modelo").eq("estado", "activo").order("matricula") : Promise.resolve({ data: [] }),
  ]);
  const jornadas = (jor.data ?? []) as Jornada[];
  const activos = itemsActivos((items.data ?? []) as ItemChecklist[]);
  const hechos = new Set(((revs.data ?? []) as { vehiculo_id: string }[]).map((x) => x.vehiculo_id));
  const vehiculos = (vehs.data ?? []) as { id: string; matricula: string; modelo: string }[];
  const pedir = m.checklist && debePedirChecklist({
    hecho: yo.vehiculo_habitual_id ? hechos.has(yo.vehiculo_habitual_id) : hechos.size > 0,
    jornadaActiva: m.jornada, jornadaAbierta: jornadas.some((j) => !j.fin), hayVehiculo: vehiculos.length > 0, hayItems: activos.length > 0,
  });
  return (
    <div className="space-y-3">
      {m.jornada && <JornadaConductor jornadas={jornadas} />}
      {pedir && <ChecklistVehiculo items={activos} vehiculos={vehiculos} vehiculoInicial={yo.vehiculo_habitual_id ?? null} />}
      {m.incidencias && <BotonIncidencia />}
    </div>
  );
}
