import { exigirRol } from "@/lib/supabase/sesion";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { clienteAdmin } from "@/lib/supabase/admin";
import { consumoMedioL100, gastoPorMes, resumenCombustible, ticketsParaConsumo, type TicketCalculo } from "@/lib/dominio/combustible";
import { euros, litros2, fechaCorta, mesLegible } from "@/lib/dominio/formato";
import GraficoCombustible from "@/components/central/GraficoCombustible";

type Q = Record<string, string | undefined>;
const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";

export default async function Combustible({ searchParams }: { searchParams: Promise<Q> }) {
  await exigirRol("operador");
  const q = await searchParams;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const f: Q = {
    vehiculo: q.vehiculo && UUID.test(q.vehiculo) ? q.vehiculo : undefined,
    conductor: q.conductor && UUID.test(q.conductor) ? q.conductor : undefined,
    mes: q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) ? q.mes : undefined,
  };
  const sb = clienteAdmin();
  const [{ data: vehiculos, error: e1 }, { data: conductores, error: e2 }, { data: todos, error }] = await Promise.all([
    sb.from("vehiculos").select("id,matricula,modelo").order("matricula"),
    sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("tickets_combustible").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }),
  ]);
  const meses = [...new Set((todos ?? []).map((t) => t.fecha.slice(0, 7)))].sort().reverse();
  const tickets = (todos ?? []).filter((t) =>
    (!f.vehiculo || t.vehiculo_id === f.vehiculo) && (!f.conductor || t.conductor_id === f.conductor) && (!f.mes || t.fecha.startsWith(f.mes)));
  const calc: TicketCalculo[] = tickets.map((t) => ({ vehiculoId: t.vehiculo_id, fecha: t.fecha, litros: Number(t.litros), importe: Number(t.importe), km: t.km }));
  const res = resumenCombustible(calc);
  const porMes = gastoPorMes(calc);
  const porVeh = new Map<string, TicketCalculo[]>();
  for (const t of todos ?? []) {
    if (f.vehiculo && t.vehiculo_id !== f.vehiculo) continue;
    porVeh.set(t.vehiculo_id, [...(porVeh.get(t.vehiculo_id) ?? []), { vehiculoId: t.vehiculo_id, fecha: t.fecha, litros: Number(t.litros), importe: Number(t.importe), km: t.km }]);
  }
  const nomVeh = new Map((vehiculos ?? []).map((v) => [v.id, v.matricula]));
  const nomCond = new Map((conductores ?? []).map((c) => [c.id, c.nombre]));
  const vehFiltrados = new Set(calc.map((c) => c.vehiculoId));
  const consumos = [...porVeh.entries()].filter(([id]) => vehFiltrados.has(id)).map(([id, ts]) => ({ id, matricula: nomVeh.get(id) ?? "—", l100: consumoMedioL100(ticketsParaConsumo(ts, { mes: f.mes })) }));
  const urls = new Map<string, string>();
  await Promise.all(tickets.filter((t) => t.foto_path).map(async (t) => {
    const { data } = await sb.storage.from("tickets").createSignedUrl(t.foto_path!, 3600);
    if (data?.signedUrl) urls.set(t.id, data.signedUrl);
  }));
  const kpi = "rounded-xl border border-slate-700 bg-slate-900 p-4";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-marca-claro">Combustible</h1>
      {(error ?? e1 ?? e2) && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">Error: {(error ?? e1 ?? e2)!.message}</p>}
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
            {tickets.map((t) => (
              <tr key={t.id} className="border-t border-slate-700">
                <td className="px-2 py-1">{urls.get(t.id)
                  ? <a href={urls.get(t.id)} target="_blank" rel="noreferrer"><img src={urls.get(t.id)} alt="Foto del ticket" className="h-12 w-12 rounded object-cover" /></a>
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
                  {t.datos_ia && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">🔎 leído automáticamente</span>}
                  {t.corregido && <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-200">✏️ corregido</span>}
                </td>
              </tr>))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
