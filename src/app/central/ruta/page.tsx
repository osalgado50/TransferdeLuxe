import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import TableroRuta, { type TarjetaRuta } from "@/components/central/TableroRuta";

function desplazar(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
}

export default async function HojaDeRuta({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(f.dia ?? "") ? f.dia! : diaMadrid(new Date());
  const desde = madridAUtc(dia, "00:00");
  const hasta = madridAUtc(desplazar(dia, 1), "00:00");
  const sb = await clienteServidor();
  const [{ data: conductores, error: errC }, { data: servicios, error }] = await Promise.all([
    sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").eq("rol", "conductor").order("nombre"),
    sb.from("servicios").select("id,estado,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros")
      .gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta).neq("estado", "cancelado").order("fecha_hora_recogida"),
  ]);
  const enlace = "rounded-lg border border-slate-600 px-3 py-1.5 hover:border-amber-400";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-amber-400">Hoja de ruta</h1>
        <Link href={`/central/ruta?dia=${desplazar(dia, -1)}`} className={enlace} aria-label="Día anterior">◀</Link>
        <span className="font-medium">{dia}</span>
        <Link href={`/central/ruta?dia=${desplazar(dia, 1)}`} className={enlace} aria-label="Día siguiente">▶</Link>
        <Link href="/central/ruta" className="text-sm text-amber-400 hover:underline">Hoy</Link>
      </div>
      {error || errC ? <p className="text-red-400">Error al cargar: {(error ?? errC)!.message}</p>
        : <TableroRuta servicios={(servicios ?? []) as TarjetaRuta[]} conductores={conductores ?? []} />}
    </div>
  );
}
