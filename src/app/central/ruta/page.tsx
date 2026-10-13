import Link from "next/link";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import type { TarjetaRuta } from "@/components/central/TableroRuta";
import { leerModulos } from "@/lib/dominio/modulos";
import TableroRuta from "@/components/central/TableroRutaCliente";
import DialogoAutoasignar from "@/components/central/DialogoAutoasignar";

function desplazar(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
}

export default async function HojaDeRuta({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(f.dia ?? "") ? f.dia! : diaMadrid(new Date());
  const desde = madridAUtc(dia, "00:00");
  const hasta = madridAUtc(desplazar(dia, 1), "00:00");
  // Margen para la viabilidad (no se pinta): de las 18:00 de la víspera a las 06:00 del día siguiente.
  const desdeCtx = madridAUtc(desplazar(dia, -1), "18:00");
  const hastaCtx = madridAUtc(desplazar(dia, 1), "06:00");
  const sb = await clienteServidor();
  const esHoy = dia === diaMadrid(new Date());
  const [{ data: conductores, error: errC }, { data: servicios, error }, { data: vehiculos }, { data: aj }, { data: posiciones }] = await Promise.all([
    sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("servicios").select("id,estado,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas,numero_vuelo,duracion_estimada_min,origen_lat,origen_lng,destino_lat,destino_lng").eq("es_prueba", false)
      .gte("fecha_hora_recogida", desdeCtx).lt("fecha_hora_recogida", hastaCtx).neq("estado", "cancelado").order("fecha_hora_recogida"),
    sb.from("vehiculos").select("id,plazas,maletas,estado"),
    sb.from("ajustes").select("modulos,umbral_sin_senal_min,margen_minimo_min").maybeSingle(),
    // Posiciones solo para el semáforo de puntualidad de hoy.
    esHoy ? sb.from("posicion_actual").select("conductor_id,lat,lng,en_servicio,registrado_en") : Promise.resolve({ data: [] }),
  ]);
  const conVuelos = leerModulos(aj?.modulos).vuelos;
  const todos = ((servicios ?? []) as TarjetaRuta[]).map((x) => (conVuelos ? x : { ...x, numero_vuelo: null }));
  const t0 = Date.parse(desde), t1 = Date.parse(hasta);
  const enDia = (x: TarjetaRuta) => { const t = Date.parse(x.fecha_hora_recogida); return t >= t0 && t < t1; };
  const delDia = todos.filter(enDia);
  const contexto = todos.filter((x) => !enDia(x));
  const enlace = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 hover:border-marca-claro";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-marca-claro">Hoja de ruta</h1>
        <Link href={`/central/ruta?dia=${desplazar(dia, -1)}`} className={enlace} aria-label="Día anterior">◀</Link>
        <span className="font-medium">{dia}</span>
        <Link href={`/central/ruta?dia=${desplazar(dia, 1)}`} className={enlace} aria-label="Día siguiente">▶</Link>
        <Link href="/central/ruta" className="inline-flex min-h-11 items-center px-2 text-sm text-marca-claro hover:underline">Hoy</Link>
        <div className="sm:ml-auto"><DialogoAutoasignar dia={dia} /></div>
      </div>
      {error || errC ? <p className="text-red-400">Error al cargar: {(error ?? errC)!.message}</p>
        : <TableroRuta servicios={delDia} contexto={contexto} conductores={conductores ?? []} vehiculos={vehiculos ?? []}
          margenMinimo={aj?.margen_minimo_min ?? 15} posiciones={esHoy ? posiciones ?? [] : null} umbralMin={aj?.umbral_sin_senal_min ?? 5} />}
    </div>
  );
}
