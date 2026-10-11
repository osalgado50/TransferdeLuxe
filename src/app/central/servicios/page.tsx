import Link from "next/link";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteServidor } from "@/lib/supabase/servidor";
import { diaMadrid } from "@/lib/dominio/geo";
import { VISTAS, atajos, diaValido, rangoPeriodo, type Vista } from "@/lib/dominio/periodo";
import CalendarioServicios from "@/components/central/CalendarioServicios";
import { leerModulos } from "@/lib/dominio/modulos";
import TablaServicios, { type FilaServicio } from "@/components/central/TablaServicios";
import { FILTROS_GRUPO, contarPorGrupo, esFiltroGrupo, estadosDeGrupo, type FiltroGrupo } from "@/lib/dominio/centralMovil";

const ESTADOS = ["pendiente", "asignado", "aceptado", "en_camino", "recogido", "completado", "cancelado", "subcontratado"];
const POR_PAGINA = 100;
const LIMITE_CAL = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cls = "w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm";
const chip = "inline-flex min-h-11 items-center rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:border-marca-claro";
const chipOn = "inline-flex min-h-11 items-center rounded-lg border border-marca bg-marca px-3 py-1.5 text-sm text-white";

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
  // Grupo (chips): si además se elige un estado exacto en el formulario, manda el estado.
  const grupo: FiltroGrupo | "" = !estado && esFiltroGrupo(f.grupo) && f.grupo !== "todos" ? f.grupo : "";
  const modo: "lista" | "calendario" = f.modo === "calendario" ? "calendario" : "lista";
  const cal = modo === "calendario";
  const pagina = Math.max(1, Math.min(200, Number.parseInt(f.pagina ?? "1", 10) || 1));
  const r = rangoPeriodo(vista, desde);

  const filtros = { estado, conductor, origen, grupo };
  const href = (v: Vista, d: string, extra: Partial<typeof filtros & { pagina: number }> = {}) => {
    const u = new URLSearchParams({ vista: v, desde: d });
    if (cal) u.set("modo", "calendario");
    const todo = { ...filtros, ...extra };
    for (const [k, val] of Object.entries(todo)) if (val && !(k === "pagina" && val === 1)) u.set(k, String(val));
    return `/central/servicios?${u}`;
  };

  const sb = await clienteServidor();
  const [{ data: conductores }, { data: aj }] = await Promise.all([sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN).order("nombre"), sb.from("ajustes").select("modulos").maybeSingle()]);
  const conVuelos = leerModulos(aj?.modulos).vuelos;
  let q = sb.from("servicios").select("*, conductor:perfiles!servicios_conductor_id_fkey(nombre)", { count: "exact" }).eq("es_prueba", false)
    .gte("fecha_hora_recogida", r.desdeUtc).lt("fecha_hora_recogida", r.hastaUtc).order("fecha_hora_recogida").range(0, cal ? LIMITE_CAL - 1 : pagina * POR_PAGINA - 1);
  if (estado) q = q.eq("estado", estado);
  const estGrupo = grupo ? estadosDeGrupo(grupo) : null;
  if (estGrupo) q = q.in("estado", [...estGrupo]);
  if (conductor) q = q.eq("conductor_id", conductor);
  if (origen) q = q.eq("origen_pedido", origen);
  // Contadores: un count exacto (head) por tarjeta; respetan conductor y origen pero no el estado.
  const cuenta = (est?: string[], sub?: boolean) => {
    let x = sb.from("servicios").select("id", { count: "exact", head: true }).eq("es_prueba", false)
      .gte("fecha_hora_recogida", r.desdeUtc).lt("fecha_hora_recogida", r.hastaUtc);
    if (conductor) x = x.eq("conductor_id", conductor);
    if (origen) x = x.eq("origen_pedido", origen);
    if (est) x = x.in("estado", est);
    if (sub) x = x.eq("subcontratar", true).not("estado", "in", "(completado,cancelado)");
    return x;
  };
  // Un count por estado (alimenta tarjetas y chips de grupo) + el de subcontratar.
  const [{ data, error, count }, csub, ...ce] = await Promise.all([q, cuenta(undefined, true), ...ESTADOS.map((e) => cuenta([e]))]);
  const errCont = csub.error != null || ce.some((x) => x.error);
  const porEstado = Object.fromEntries(ESTADOS.map((e, i) => [e, ce[i].count ?? 0]));
  const n = (...es: string[]) => es.reduce((t, e) => t + (porEstado[e] ?? 0), 0);
  const cs = [n("pendiente"), n("asignado"), n("aceptado", "en_camino", "recogido"), n("completado"), csub.count ?? 0, n("cancelado")];
  const contGrupos = contarPorGrupo(porEstado);
  const a = atajos(hoy);
  const hayMas = !cal && (count ?? 0) > pagina * POR_PAGINA;
  const excede = cal && (count ?? 0) > LIMITE_CAL;
  const nombres = ["Pendientes", "Esperando respuesta", "En curso", "Completados", "Subcontratar", "Cancelados"];
  const kpis: [string, string][] = nombres.map((t, i) => [t, errCont ? "—" : String(cs[i])]);
  // Chips de grupo: conservan periodo, modo, conductor y origen; sustituyen el filtro de estado exacto.
  const grupoActivo: FiltroGrupo | null = grupo || (estado ? null : "todos");
  const hrefGrupo = (g: FiltroGrupo) => href(vista, desde, { estado: "", grupo: g === "todos" ? "" : g });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-marca-claro">Agenda de servicios</h1>
        <Link href="/central/servicios/nuevo" className="inline-flex min-h-11 items-center rounded-lg bg-marca px-4 py-2 font-medium text-white hover:bg-marca-oscuro">Nuevo servicio</Link>
      </div>

      <nav aria-label="Atajos" className="flex flex-wrap gap-2">
        {([["Hoy", a.hoy], ["Mañana", a.manana], ["Pasado mañana", a.pasado], ["Esta semana", a.semana], ["Este mes", a.mes]] as const).map(([t, x]) => (
          <Link key={t} href={href(x.vista, x.desde)} className={chip}>{t}</Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Modo">
          {(["lista", "calendario"] as const).map((m) => {
            const u = new URLSearchParams({ vista, desde });
            for (const [k, val] of Object.entries(filtros)) if (val) u.set(k, val);
            if (m === "calendario") u.set("modo", m);
            return <Link key={m} href={`/central/servicios?${u}`} className={m === modo ? chipOn : chip}>{m === "lista" ? "Lista" : "Calendario"}</Link>;
          })}
        </div>
        <div className="flex gap-1" role="group" aria-label="Vista">
          {VISTAS.map((v) => <Link key={v} href={href(v, desde)} className={v === vista ? chipOn : chip}>{v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}</Link>)}
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(vista, r.anterior)} aria-label="Periodo anterior" className={chip}>◀</Link>
          <span className="min-w-36 text-center font-medium sm:min-w-48">{r.etiqueta}</span>
          <Link href={href(vista, r.siguiente)} aria-label="Periodo siguiente" className={chip}>▶</Link>
        </div>
      </div>

      <form className="grid grid-cols-2 items-end gap-3 text-sm sm:flex sm:flex-wrap">
        <input type="hidden" name="vista" value={vista} />
        {cal && <input type="hidden" name="modo" value="calendario" />}
        {grupo && <input type="hidden" name="grupo" value={grupo} />}
        <label className="min-w-0">Ir a<br /><input type="date" name="desde" defaultValue={desde} className={cls} /></label>
        <label className="min-w-0">Estado<br /><select name="estado" defaultValue={estado} className={cls}><option value="">Todos</option>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="min-w-0">Conductor<br /><select name="conductor" defaultValue={conductor} className={cls}><option value="">Todos</option>{(conductores ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        <label className="min-w-0">Origen<br /><select name="origen" defaultValue={origen} className={cls}><option value="">Todos</option><option value="web">Web</option><option value="manual">Manual</option></select></label>
        <button className="rounded-lg border border-slate-600 px-3 py-1.5 hover:border-marca-claro">Filtrar</button>
      </form>

      {errCont && <p className="text-sm text-amber-400">No se pudieron calcular los contadores del periodo.</p>}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([t, n]) => (
          <div key={t} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            <dt className="text-xs text-slate-400">{t}</dt><dd className="text-xl font-semibold">{n}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Filtrar por grupo" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTROS_GRUPO.map((g) => (
          <Link key={g.clave} href={hrefGrupo(g.clave)} aria-current={g.clave === grupoActivo ? "true" : undefined}
            className={`${g.clave === grupoActivo ? chipOn : chip} shrink-0 whitespace-nowrap font-medium`}>
            {g.titulo} ({errCont ? "—" : contGrupos[g.clave]})
          </Link>
        ))}
      </nav>

      {excede && <p className="text-sm text-amber-400">Hay más de {LIMITE_CAL} servicios en el periodo: el calendario muestra solo los primeros {LIMITE_CAL}. Acota el periodo o los filtros.</p>}
      {error ? <p className="text-red-400">Error al cargar: {error.message}</p> : cal
        ? <CalendarioServicios vista={vista} desde={desde} inicio={r.inicio} hoy={hoy} filas={(data ?? []) as FilaServicio[]} />
        : <TablaServicios filas={((data ?? []) as FilaServicio[]).map((x) => (conVuelos ? x : { ...x, numero_vuelo: null }))} />}
      {hayMas && <div className="text-center"><Link href={href(vista, desde, { pagina: pagina + 1 })} className={chip}>Mostrar más ({(count ?? 0) - pagina * POR_PAGINA} restantes)</Link></div>}
    </div>
  );
}
