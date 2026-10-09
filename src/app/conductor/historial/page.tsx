import { exigirRol } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc } from "@/lib/reserva/esquema";
import { euros, litros2, fechaCorta } from "@/lib/dominio/formato";

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Historial() {
  const yo = await exigirRol("conductor");
  const hoy = diaMadrid(new Date());
  const desdeDia = diaMadrid(new Date(Date.parse(`${hoy}T12:00:00Z`) - 6 * 86400e3));
  const sb = await clienteServidor();
  const [s, t] = await Promise.all([
    sb.from("servicios").select("id,estado,fecha_hora_recogida,origen_texto,destino_texto")
      .eq("conductor_id", yo.id).gte("fecha_hora_recogida", madridAUtc(desdeDia, "00:00")).order("fecha_hora_recogida", { ascending: false }),
    sb.from("tickets_combustible").select("id,fecha,litros,importe").eq("conductor_id", yo.id).gte("fecha", desdeDia).order("fecha", { ascending: false }),
  ]);
  const servicios = s.data ?? [], tickets = t.data ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-amber-400">Historial · últimos 7 días</h1>
      {(s.error || t.error) && <p role="alert" className="text-red-400">Error al cargar: {(s.error ?? t.error)!.message}</p>}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Servicios</h2>
        {servicios.length === 0 ? <p className="text-slate-400">Sin servicios en los últimos 7 días.</p> : (
          <ul className="space-y-2">{servicios.map((x) => (
            <li key={x.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
              <p className="text-sm text-slate-400">{hora.format(new Date(x.fecha_hora_recogida))} · <span className="text-amber-300">{x.estado.replace("_", " ")}</span></p>
              <p>{x.origen_texto} → {x.destino_texto}</p>
            </li>))}
          </ul>)}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Tickets de combustible</h2>
        {tickets.length === 0 ? <p className="text-slate-400">Sin tickets en los últimos 7 días.</p> : (
          <ul className="space-y-2">{tickets.map((x) => (
            <li key={x.id} className="flex justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
              <span>{fechaCorta(x.fecha)} · {litros2(Number(x.litros))}</span><span className="font-medium text-amber-300">{euros(Number(x.importe))}</span>
            </li>))}
          </ul>)}
      </section>
    </div>
  );
}
