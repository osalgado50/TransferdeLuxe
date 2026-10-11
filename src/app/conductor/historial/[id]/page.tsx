import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import FichaRecorrido from "@/components/mapa/FichaRecorrido";
import { CAMPOS_RECORRIDO, type RecorridoGuardado } from "@/lib/dominio/recorrido";

const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Ruta que hizo el conductor en un viaje completado (solo los suyos: RLS de servicios y recorridos). */
export default async function RutaViaje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const yo = await exigirConductor();
  const sb = await clienteServidor();
  const [{ data: s }, { data: r }] = await Promise.all([
    sb.from("servicios").select("id,fecha_hora_recogida,origen_texto,destino_texto,conductor_id").eq("id", id).eq("conductor_id", yo.id).maybeSingle(),
    sb.from("recorridos").select(CAMPOS_RECORRIDO).eq("servicio_id", id).maybeSingle(),
  ]);
  if (!s) notFound();
  return (
    <div className="space-y-4">
      <Link href="/conductor/historial" className="inline-flex min-h-11 items-center text-marca-claro hover:underline">‹ Historial</Link>
      <div>
        <h1 className="text-xl font-semibold text-marca-claro">{fecha.format(new Date(s.fecha_hora_recogida))}</h1>
        <p>{s.origen_texto} → {s.destino_texto}</p>
      </div>
      {r ? <FichaRecorrido r={r as RecorridoGuardado} /> : <p className="text-slate-400">Este viaje aún no tiene el recorrido guardado.</p>}
    </div>
  );
}
