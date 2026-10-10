import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { VISTAS, atajos, contar, diaValido, rangoPeriodo, type Vista } from "@/lib/dominio/periodo";
import TablaServicios, { type FilaServicio } from "@/components/central/TablaServicios";

const ESTADOS = ["pendiente", "asignado", "aceptado", "en_camino", "recogido", "completado", "cancelado", "subcontratado"];
const POR_PAGINA = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cls = "rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm";
const chip = "rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:border-marca-claro";
const chipOn = "rounded-lg border border-marca bg-marca px-3 py-1.5 text-sm text-white";

type P = Record<string, string | undefined>;

export default async function ListadoServicios({ searchParams }: { searchParams: Promise<P> }) {
  const f = await searchParams;
  const hoy = diaMadrid(new Date());
  // Compatibilidad: ?fecha= antiguo equivale a vista día.
  const vista: Vista = VISTAS.includes(f.vista as Vista) ? (f.vista as Vista) : "dia";
  const desde = diaValido(f.desde) ? f.desde : diaValido(f.fecha) ? f.fecha : hoy;
  const estado = f.estado && ESTADOS.includes(f.estado) ? f.estado : "";
  const conductor = f.conductor && UUID.test(f.conductor) ? f.conductor : "";
  const origen = f.origen === "web" || f.origen === "manual" ? f.origen : "";
  const pagina = Math.max(1, Math.min(200, Number.parseInt(f.pagina ?? "1", 10) || 1));
  const r = rangoPeriodo(vista, desde);

  const filtros = { estado, conductor, origen };
  const href = (v: Vista, d: string, extra: Partial<typeof filtros & { pagina: number }> = {}) => {
    const u = new URLSearchParams({ vista: v, desde: d });
    const todo = { ...filtros, ...extra };
    for (const [k, val] of Object.entries(todo)) if (val && !(k === "pagina" && val === 1)) u.set(k, String(val));
    return `/central/servicios?${u}`;
  };

  const sb = await clienteServidor();
  const { data: conductores } = await sb.from("perfiles").select("id,nombre").eq("rol", "conductor").order("nombre");
  let q = sb.from("servicios").select("*, conductor:perfiles!servicios_conductor_id_fkey(nombre)", { count: "exact" })
    .gte("fecha_hora_recogida", r.desdeUtc).lt("fecha_hora_recogida", r.hastaUtc).order("fecha_hora_recogida").range(0, pagina * POR_PAGINA - 1);
  // Los contadores respetan conductor y origen pero no el estado, para ver el reparto completo del periodo.
  let qc = sb.from("servicios").select("estado,subcontratar").gte("fecha_hora_recogida", r.desdeUtc).lt("fecha_hora_recogida", r.hastaUtc).limit(5000);
  if (estado) q = q.eq("estado", estado);
  if (conductor) { q = q.eq("conductor_id", conductor); qc = qc.eq("conductor_id", conductor); }
  if (origen) { q = q.eq("origen_pedido", origen); qc = qc.eq("origen_pedido", origen); }
  const [{ data, error, count }, { data: filasC }] = await Promise.all([q, qc]);
  const c = contar(filasC ?? []);
  const a = atajos(hoy);
  const hayMas = (count ?? 0) > pagina * POR_PAGINA;
  const kpis: [string, number][] = [["Pendientes", c.pendientes], ["Esperando respuesta", c.esperando], ["En curso", c.enCurso],
    ["Completados", c.completados], ["Subcontratar", c.subcontratar], ["Cancelados", c.cancelados]];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-marca-claro">Agenda de servicios</h1>
        <Link href="/central/servicios/nuevo" className="rounded-lg bg-marca px-4 py-2 font-medium text-white hover:bg-marca-oscuro">Nuevo servicio</Link>
      </div>

      <nav aria-label="Atajos" className="flex flex-wrap gap-2">
        {([["Hoy", a.hoy], ["Mañana", a.manana], ["Pasado mañana", a.pasado], ["Esta semana", a.semana], ["Este mes", a.mes]] as const).map(([t, x]) => (
          <Link key={t} href={href(x.vista, x.desde)} className={chip}>{t}</Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Vista">
          {VISTAS.map((v) => <Link key={v} href={href(v, desde)} className={v === vista ? chipOn : chip}>{v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}</Link>)}
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(vista, r.anterior)} aria-label="Periodo anterior" className={chip}>◀</Link>
          <span className="min-w-48 text-center font-medium">{r.etiqueta}</span>
          <Link href={href(vista, r.siguiente)} aria-label="Periodo siguiente" className={chip}>▶</Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="vista" value={vista} />
        <label>Ir a<br /><input type="date" name="desde" defaultValue={desde} className={cls} /></label>
        <label>Estado<br /><select name="estado" defaultValue={estado} className={cls}><option value="">Todos</option>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label>Conductor<br /><select name="conductor" defaultValue={conductor} className={cls}><option value="">Todos</option>{(conductores ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        <label>Origen<br /><select name="origen" defaultValue={origen} className={cls}><option value="">Todos</option><option value="web">Web</option><option value="manual">Manual</option></select></label>
        <button className="rounded-lg border border-slate-600 px-3 py-1.5 hover:border-marca-claro">Filtrar</button>
      </form>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([t, n]) => (
          <div key={t} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            <dt className="text-xs text-slate-400">{t}</dt><dd className="text-xl font-semibold">{n}</dd>
          </div>
        ))}
      </dl>

      {error ? <p className="text-red-400">Error al cargar: {error.message}</p> : <TablaServicios filas={(data ?? []) as FilaServicio[]} />}
      {hayMas && <div className="text-center"><Link href={href(vista, desde, { pagina: pagina + 1 })} className={chip}>Mostrar más ({(count ?? 0) - pagina * POR_PAGINA} restantes)</Link></div>}
    </div>
  );
}
