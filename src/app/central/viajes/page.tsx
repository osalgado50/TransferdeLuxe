import Link from "next/link";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import { diaMadrid } from "@/lib/dominio/geo";
import { madridAUtc, sumarDias } from "@/lib/dominio/dias";
import { diaValido } from "@/lib/dominio/periodo";
import { CAMPOS_RECORRIDO, textoDuracion, textoKm, type RecorridoGuardado } from "@/lib/dominio/recorrido";
import MiniRecorrido from "@/components/mapa/MiniRecorrido";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE = 200;
const campo = "rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm";
const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Fila = { id: string; fecha_hora_recogida: string; origen_texto: string; destino_texto: string; pasajeros: number;
  conductor: { nombre: string } | null; recorrido: RecorridoGuardado | null };

export default async function HistorialViajes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("operador");
  const f = await searchParams;
  const hoy = diaMadrid(new Date());
  const hasta = diaValido(f.hasta) ? f.hasta : hoy;
  const desde = diaValido(f.desde) && f.desde <= hasta ? f.desde : sumarDias(hasta, -6);
  const conductor = f.conductor && UUID.test(f.conductor) ? f.conductor : "";
  const sb = await clienteServidor();
  let q = sb.from("servicios")
    .select(`id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,conductor:perfiles!servicios_conductor_id_fkey(nombre),recorrido:recorridos(${CAMPOS_RECORRIDO})`, { count: "exact" }).eq("es_prueba", false)
    .eq("estado", "completado").gte("fecha_hora_recogida", madridAUtc(desde, "00:00")).lt("fecha_hora_recogida", madridAUtc(sumarDias(hasta, 1), "00:00"))
    .order("fecha_hora_recogida", { ascending: false }).limit(LIMITE);
  if (conductor) q = q.eq("conductor_id", conductor);
  const [{ data, error, count }, { data: conductores }] = await Promise.all([q, sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN).order("nombre")]);
  const filas = (data ?? []) as unknown as Fila[];
  const conRec = filas.filter((x) => (x.recorrido?.puntos.length ?? 0) >= 2);
  const kmTotal = conRec.reduce((t, x) => t + Number(x.recorrido!.km), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-marca-claro">Historial de viajes</h1>
        <p className="text-sm text-slate-400">Servicios completados con la ruta que hizo el conductor (GPS). Pulsa un viaje para ver el mapa grande.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-400">Desde<br /><input type="date" name="desde" defaultValue={desde} max={hoy} className={campo} /></label>
        <label className="text-sm text-slate-400">Hasta<br /><input type="date" name="hasta" defaultValue={hasta} max={hoy} className={campo} /></label>
        <label className="text-sm text-slate-400">Conductor<br />
          <select name="conductor" defaultValue={conductor} className={campo}>
            <option value="">Todos</option>
            {(conductores ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <button className="min-h-9 rounded-lg bg-marca px-4 py-1.5 text-sm text-white hover:bg-marca-oscuro">Filtrar</button>
      </form>
      {error && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">Error al cargar: {error.message}</p>}
      <p className="text-sm text-slate-300">
        {filas.length} viaje{filas.length === 1 ? "" : "s"} ({conRec.length} con GPS){(count ?? 0) > LIMITE && ` (de ${count}; se muestran los ${LIMITE} más recientes)`} · {textoKm(kmTotal)} recorridos
      </p>
      {filas.length === 0 ? <p className="text-slate-400">No hay viajes completados en estas fechas.</p> : (
        <ul className="space-y-2">
          {filas.map((x) => {
            const r = x.recorrido;
            return (
              <li key={x.id}>
                <Link href={`/central/servicios/${x.id}`} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2 hover:border-marca-claro">
                  <MiniRecorrido puntos={r?.puntos} corte={r?.corte} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-slate-400">{fecha.format(new Date(x.fecha_hora_recogida))} · {x.conductor?.nombre ?? "Sin conductor"}</p>
                    <p className="truncate text-slate-100">{x.origen_texto} → {x.destino_texto}</p>
                    <p className="text-slate-300">{r && r.puntos.length >= 2 ? <><b className="text-marca-claro">{textoKm(r.km)}</b> · {textoDuracion(r.duracion_min)}</>
                      : <span className="text-slate-500">{r ? "Sin posiciones GPS de este viaje" : "Sin recorrido guardado"}</span>}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
