import { clienteServidor } from "@/lib/supabase/servidor";
import PanelEnVivo from "@/components/central/PanelEnVivo";
import type { Servicio } from "@/lib/dominio/tipos";

export const dynamic = "force-dynamic";

export default async function PanelCentral() {
  const sb = await clienteServidor();
  const desde = new Date(Date.now() - 24 * 3600e3).toISOString();
  const hasta = new Date(Date.now() + 48 * 3600e3).toISOString();
  const [ventana, sinVer, pos, perfiles, vehiculos, ajustes, eventos] = await Promise.all([
    sb.from("servicios").select("*").gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta),
    sb.from("servicios").select("*").eq("incidencia_vista", false),
    sb.from("posicion_actual").select("*"),
    sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").eq("rol", "conductor"),
    sb.from("vehiculos").select("id,matricula"),
    sb.from("ajustes").select("umbral_sin_senal_min").eq("id", 1).maybeSingle(),
    sb.from("eventos_servicio").select("id,servicio_id,tipo,motivo,creado_en").eq("tipo", "rechazado").order("creado_en", { ascending: false }).limit(100),
  ]);
  const porId = new Map<string, Servicio>();
  for (const s of [...(ventana.data ?? []), ...(sinVer.data ?? [])] as Servicio[]) porId.set(s.id, s);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Panel en vivo</h1>
      <PanelEnVivo
        servicios={[...porId.values()]} posiciones={pos.data ?? []} eventos={eventos.data ?? []}
        conductores={perfiles.data ?? []} vehiculos={vehiculos.data ?? []} umbralMin={ajustes.data?.umbral_sin_senal_min ?? 5}
      />
    </div>
  );
}
