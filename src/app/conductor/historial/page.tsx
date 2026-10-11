import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import { euros, litros2, fechaCorta } from "@/lib/dominio/formato";
import Link from "next/link";
import MiniRecorrido from "@/components/mapa/MiniRecorrido";
import { CAMPOS_RECORRIDO, textoDuracion, textoKm, type RecorridoGuardado } from "@/lib/dominio/recorrido";

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Historial() {
  const yo = await exigirConductor();
  const hoy = diaMadrid(new Date());
  const desdeDia = diaMadrid(new Date(Date.parse(`${hoy}T12:00:00Z`) - 6 * 86400e3));
  const sb = await clienteServidor();
  const [s, t] = await Promise.all([
    sb.from("servicios").select(`id,estado,fecha_hora_recogida,origen_texto,destino_texto,recorrido:recorridos(${CAMPOS_RECORRIDO})`).eq("es_prueba", false)
      .eq("conductor_id", yo.id).gte("fecha_hora_recogida", madridAUtc(desdeDia, "00:00")).order("fecha_hora_recogida", { ascending: false }),
    sb.from("tickets_combustible").select("id,fecha,litros,importe").eq("conductor_id", yo.id).gte("fecha", desdeDia).order("fecha", { ascending: false }),
  ]);
  // Solo cuenta como ruta si hay al menos 2 posiciones GPS (sin GPS no hay nada que dibujar).
  const servicios = ((s.data ?? []) as unknown as { id: string; estado: string; fecha_hora_recogida: string; origen_texto: string; destino_texto: string; recorrido: RecorridoGuardado | null }[])
    .map((x) => ({ ...x, recorrido: (x.recorrido?.puntos.length ?? 0) >= 2 ? x.recorrido : null }));
  const tickets = t.data ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-marca-claro">Historial · últimos 7 días</h1>
      {(s.error || t.error) && <p role="alert" className="text-red-400">Error al cargar: {(s.error ?? t.error)!.message}</p>}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Servicios</h2>
        {servicios.length === 0 ? <p className="text-slate-400">Sin servicios en los últimos 7 días.</p> : (
          <ul className="space-y-2">{servicios.map((x) => {
            const datos = (
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-400">{hora.format(new Date(x.fecha_hora_recogida))} · <span className="text-marca-claro">{x.estado.replaceAll("_", " ")}</span></p>
                <p>{x.origen_texto} → {x.destino_texto}</p>
                {x.recorrido && <p className="text-sm text-slate-300"><b className="text-marca-claro">{textoKm(x.recorrido.km)}</b> · {textoDuracion(x.recorrido.duracion_min)} · ver ruta ›</p>}
              </div>);
            // Completado con recorrido guardado: dibujo de la ruta y, al tocar, el mapa grande.
            return (
              <li key={x.id}>{x.recorrido
                ? <Link href={`/conductor/historial/${x.id}`} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 hover:border-marca-claro">
                    <MiniRecorrido puntos={x.recorrido.puntos} corte={x.recorrido.corte} ancho={96} alto={72} />{datos}</Link>
                : <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">{datos}</div>}
              </li>);
          })}
          </ul>)}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Tickets de combustible</h2>
        {tickets.length === 0 ? <p className="text-slate-400">Sin tickets en los últimos 7 días.</p> : (
          <ul className="space-y-2">{tickets.map((x) => (
            <li key={x.id} className="flex justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
              <span>{fechaCorta(x.fecha)} · {litros2(Number(x.litros))}</span><span className="font-medium text-marca-claro">{euros(Number(x.importe))}</span>
            </li>))}
          </ul>)}
      </section>
    </div>
  );
}
