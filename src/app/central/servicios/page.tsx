import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import TablaServicios, { type FilaServicio } from "@/components/central/TablaServicios";

const ESTADOS = ["pendiente", "asignado", "aceptado", "en_camino", "recogido", "completado", "cancelado", "subcontratado"];
const cls = "rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm";

// Día Madrid [d, d+1) como instantes UTC, probando offsets +1/+2 sin depender de librerías.
function rangoDia(dia: string): [string, string] {
  const base = Date.parse(`${dia}T00:00:00Z`);
  const inicio = [2, 1].map((h) => base - h * 3600e3).find((t) => diaMadrid(new Date(t)) === dia && diaMadrid(new Date(t - 1)) !== dia) ?? base - 3600e3;
  const fin = [2, 1].map((h) => base + 86400e3 - h * 3600e3).find((t) => diaMadrid(new Date(t)) !== dia && diaMadrid(new Date(t - 1)) === dia) ?? base + 86400e3 - 3600e3;
  return [new Date(inicio).toISOString(), new Date(fin).toISOString()];
}

export default async function ListadoServicios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const f = await searchParams;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f.fecha ?? "") ? f.fecha! : diaMadrid(new Date());
  const [desde, hasta] = rangoDia(fecha);
  const sb = await clienteServidor();
  const { data: conductores } = await sb.from("perfiles").select("id,nombre").eq("rol", "conductor").order("nombre");
  let q = sb.from("servicios").select("*, conductor:perfiles!servicios_conductor_id_fkey(nombre)")
    .gte("fecha_hora_recogida", desde).lt("fecha_hora_recogida", hasta).order("fecha_hora_recogida");
  if (f.estado && ESTADOS.includes(f.estado)) q = q.eq("estado", f.estado);
  if (f.conductor) q = q.eq("conductor_id", f.conductor);
  if (f.origen === "web" || f.origen === "manual") q = q.eq("origen_pedido", f.origen);
  const { data, error } = await q;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-marca-claro">Servicios</h1>
        <Link href="/central/servicios/nuevo" className="rounded-lg bg-marca px-4 py-2 font-medium text-white hover:bg-marca-oscuro">Nuevo servicio</Link>
      </div>
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label>Fecha<br /><input type="date" name="fecha" defaultValue={fecha} className={cls} /></label>
        <label>Estado<br /><select name="estado" defaultValue={f.estado ?? ""} className={cls}><option value="">Todos</option>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Conductor<br /><select name="conductor" defaultValue={f.conductor ?? ""} className={cls}><option value="">Todos</option>{(conductores ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Origen<br /><select name="origen" defaultValue={f.origen ?? ""} className={cls}><option value="">Todos</option><option value="web">Web</option><option value="manual">Manual</option></select></label>
        <button className="rounded-lg border border-slate-600 px-3 py-1.5 hover:border-marca-claro">Filtrar</button>
      </form>
      {error ? <p className="text-red-400">Error al cargar: {error.message}</p> : <TablaServicios filas={(data ?? []) as FilaServicio[]} />}
    </div>
  );
}
