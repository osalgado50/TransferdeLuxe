import Link from "next/link";
import { exigirRol } from "@/lib/supabase/sesion";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteAdmin } from "@/lib/supabase/admin";
import { consumoMedioL100, gastoPorMes, mesesEntre, resumenCombustible, type TicketCalculo } from "@/lib/dominio/combustible";
import { diaMadrid } from "@/lib/dominio/geo";
import { euros, litros2, fechaCorta, mesLegible } from "@/lib/dominio/formato";
import { limitesMes, ticketsLigeros, ticketsParaConsumoDe } from "@/lib/combustible/consultas";
import GraficoCombustible from "@/components/central/GraficoCombustible";
import BotonAnularTicket from "@/components/central/BotonAnularTicket";

type Q = Record<string, string | undefined>;
const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const POR_PAGINA = 50;
const MAX_FILAS = 1000;
// Columnas de la tabla: sin el JSON del lector (solo si lo hubo) ni nada que no se pinte.
const COLUMNAS_TABLA = "id,fecha,hora,conductor_id,vehiculo_id,gasolinera,nif_gasolinera,numero_factura,litros,importe,base_imponible,iva_pct,iva_importe,km,foto_path,corregido,ia:datos_ia->>confianza,anulado,anulado_motivo";

export default async function Combustible({ searchParams }: { searchParams: Promise<Q> }) {
  await exigirRol("operador");
  const q = await searchParams;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const f = {
    vehiculo: q.vehiculo && UUID.test(q.vehiculo) ? q.vehiculo : undefined,
    conductor: q.conductor && UUID.test(q.conductor) ? q.conductor : undefined,
    mes: q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) ? q.mes : undefined,
    anulados: q.anulados === "1",
  };
  const mostrar = Math.min(MAX_FILAS, Math.max(POR_PAGINA, Math.ceil((Number(q.n) || POR_PAGINA) / POR_PAGINA) * POR_PAGINA));
  const rango = f.mes ? limitesMes(f.mes) : null;
  const sb = clienteAdmin();
  // Tabla: solo la página visible (filtrada y paginada en SQL). Los anulados, solo si se piden.
  let tabla = sb.from("tickets_combustible").select(COLUMNAS_TABLA, { count: "exact" });
  if (!f.anulados) tabla = tabla.eq("anulado", false);
  if (rango) tabla = tabla.gte("fecha", rango.inicio).lte("fecha", rango.fin);
  if (f.vehiculo) tabla = tabla.eq("vehiculo_id", f.vehiculo);
  if (f.conductor) tabla = tabla.eq("conductor_id", f.conductor);
  const [{ data: vehiculos, error: e1 }, { data: conductores, error: e2 }, { data: filas, count, error }, { data: ligeros, error: e3 }, { data: primero }] = await Promise.all([
    sb.from("vehiculos").select("id,matricula,modelo").order("matricula"),
    sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN).order("nombre"),
    tabla.order("fecha", { ascending: false }).order("creado_en", { ascending: false }).range(0, mostrar - 1),
    // Totales y gráfico: todos los tickets válidos del filtro, con lo justo.
    ticketsLigeros(sb, { desde: rango?.inicio, hasta: rango?.fin, vehiculo: f.vehiculo, conductor: f.conductor }),
    sb.from("tickets_combustible").select("fecha").eq("anulado", false).order("fecha").limit(1),
  ]);
  const mesActual = diaMadrid(new Date()).slice(0, 7);
  const primerMes = ((primero ?? [])[0]?.fecha as string | undefined)?.slice(0, 7) ?? mesActual;
  const meses = mesesEntre(primerMes < mesActual ? primerMes : mesActual, mesActual);
  if (f.mes && !meses.includes(f.mes)) meses.push(f.mes);
  const calc: TicketCalculo[] = ligeros.map((t) => ({ vehiculoId: t.vehiculo_id, fecha: t.fecha, litros: t.litros, importe: t.importe, km: t.km }));
  const res = resumenCombustible(calc);
  const porMes = gastoPorMes(calc);
  const nomVeh = new Map((vehiculos ?? []).map((v) => [v.id, v.matricula]));
  const nomCond = new Map((conductores ?? []).map((c) => [c.id, c.nombre]));
  // Consumo por vehículo: tramos entre repostajes (de cualquier conductor) que acaban en un ticket del filtro.
  const vehFiltrados = [...new Set(ligeros.map((t) => t.vehiculo_id))];
  const historico = await ticketsParaConsumoDe(sb, vehFiltrados, f.mes);
  const enFiltro = new Set(ligeros.map((t) => t.id));
  const consumos = vehFiltrados.map((id) => ({ id, matricula: nomVeh.get(id) ?? "—", l100: consumoMedioL100(historico.get(id) ?? [], (h) => enFiltro.has(h.id)) }))
    .sort((a, b) => a.matricula.localeCompare(b.matricula));
  const tickets = filas ?? [];
  // URLs firmadas en lote y solo de la página visible.
  const rutas = tickets.flatMap((t) => (t.foto_path ? [t.foto_path as string] : []));
  const { data: firmadas } = rutas.length ? await sb.storage.from("tickets").createSignedUrls(rutas, 3600) : { data: [] };
  const urlDe = new Map<string, string>((firmadas ?? []).flatMap((x) => (x.path && x.signedUrl ? [[x.path, x.signedUrl] as [string, string]] : [])));
  const total = count ?? tickets.length;
  const enlace = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ vehiculo: f.vehiculo, conductor: f.conductor, mes: f.mes, anulados: f.anulados ? "1" : undefined, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/central/combustible${s ? `?${s}` : ""}`;
  };
  const kpi = "rounded-xl border border-slate-700 bg-slate-900 p-4";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-marca-claro">Combustible</h1>
      {(error ?? e1 ?? e2 ?? e3) && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">Error: {(error ?? e1 ?? e2 ?? e3)!.message}</p>}
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-400">Vehículo<br />
          <select name="vehiculo" defaultValue={f.vehiculo ?? ""} className={campo}><option value="">Todos</option>
            {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula}</option>)}</select></label>
        <label className="text-sm text-slate-400">Conductor<br />
          <select name="conductor" defaultValue={f.conductor ?? ""} className={campo}><option value="">Todos</option>
            {(conductores ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label className="text-sm text-slate-400">Mes<br />
          <select name="mes" defaultValue={f.mes ?? ""} className={campo}><option value="">Todos</option>
            {meses.map((m) => <option key={m} value={m}>{mesLegible(m)}</option>)}</select></label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" name="anulados" value="1" defaultChecked={f.anulados} /> Ver anulados</label>
        <button className="rounded bg-marca px-3 py-1 text-sm font-medium text-white hover:bg-marca-oscuro">Filtrar</button>
        <a href="/central/combustible" className="inline-flex min-h-11 items-center px-2 text-sm text-slate-400 hover:text-marca-claro">Limpiar</a>
      </form>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={kpi}><p className="text-sm text-slate-400">Gasto total</p><p data-kpi="gasto" className="text-2xl font-semibold">{euros(res.gasto)}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Litros</p><p data-kpi="litros" className="text-2xl font-semibold">{litros2(res.litros)}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Tickets</p><p data-kpi="tickets" className="text-2xl font-semibold">{res.tickets}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Consumo medio por vehículo</p>
          {consumos.length === 0 ? <p className="text-slate-400">—</p> : (
            <ul className="mt-1 space-y-0.5 text-sm">{consumos.map((c) => (
              <li key={c.id} data-consumo={c.matricula} className="flex justify-between gap-2"><span>{c.matricula}</span>
                <span className="font-medium">{c.l100 === null ? "sin datos" : `${c.l100.toLocaleString("es-ES", { minimumFractionDigits: 1 })} L/100 km`}</span></li>))}
            </ul>)}</div>
      </section>

      <section className={kpi}>
        <h2 className="mb-2 text-lg font-semibold">Gasto por mes (€)</h2>
        <GraficoCombustible datos={porMes} />
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-slate-400"><tr>
            {["Foto", "Fecha", "Conductor", "Vehículo", "Gasolinera", "Litros", "Importe", "Km", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>{tickets.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-slate-400">Sin tickets con estos filtros.</td></tr>}
            {tickets.map((t) => {
              const url = t.foto_path ? urlDe.get(t.foto_path) : undefined;
              return (
              <tr key={t.id} data-anulado={t.anulado ? "si" : undefined} className={`border-t border-slate-700 ${t.anulado ? "text-slate-500 opacity-60" : ""}`}>
                <td className="px-2 py-1">{url
                  ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto del ticket" className="h-12 w-12 rounded object-cover" /></a>
                  : <span className="text-slate-500">{t.foto_path ? "foto no disponible" : "—"}</span>}</td>
                <td className="px-2">{fechaCorta(t.fecha)}{t.hora ? <span className="block text-xs text-slate-400">{t.hora}</span> : null}</td>
                <td className="px-2">{nomCond.get(t.conductor_id) ?? "—"}</td>
                <td className="px-2">{nomVeh.get(t.vehiculo_id) ?? "—"}</td>
                <td className="px-2">{t.gasolinera ?? "—"}
                  {(t.nif_gasolinera || t.numero_factura) && <span className="block text-xs text-slate-400">{[t.nif_gasolinera && `CIF ${t.nif_gasolinera}`, t.numero_factura && `Fra. ${t.numero_factura}`].filter(Boolean).join(" · ")}</span>}</td>
                <td className="px-2">{litros2(Number(t.litros))}</td>
                <td className="px-2">{euros(Number(t.importe))}
                  {t.base_imponible != null && <span className="block text-xs text-slate-400">base {euros(Number(t.base_imponible))}{t.iva_importe != null ? ` + IVA ${t.iva_pct != null ? `${Number(t.iva_pct)} % ` : ""}${euros(Number(t.iva_importe))}` : ""}</span>}</td>
                <td className="px-2">{t.km}</td>
                <td className="space-x-1 px-2">
                  {t.anulado
                    ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300" title={t.anulado_motivo ?? undefined}>Anulado{t.anulado_motivo ? `: ${t.anulado_motivo}` : ""}</span>
                    : <>
                      {t.ia && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">🔎 leído automáticamente</span>}
                      {t.corregido && <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-200">✏️ corregido</span>}
                      <BotonAnularTicket id={t.id} resumen={`del ${fechaCorta(t.fecha)} (${euros(Number(t.importe))}, ${nomVeh.get(t.vehiculo_id) ?? "—"})`} />
                    </>}
                </td>
              </tr>);
            })}
          </tbody>
        </table>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span>Mostrando {tickets.length} de {total}</span>
          {total > tickets.length && tickets.length < MAX_FILAS && <Link href={enlace({ n: String(mostrar + POR_PAGINA) })} scroll={false} className="inline-flex min-h-11 items-center rounded border border-slate-600 px-3 text-slate-200 hover:bg-slate-800">Mostrar más</Link>}
        </p>
      </section>
    </div>
  );
}
