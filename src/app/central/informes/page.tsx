import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/supabase/sesion";
import { cargarInforme, leerFiltro, moduloInformesActivo } from "@/lib/informes/cargar";
import { euros, litros2, mesLegible } from "@/lib/dominio/formato";
import type { FilaInforme } from "@/lib/dominio/informes";
import GraficoServicios from "@/components/central/GraficoServicios";

export const metadata = { title: "Informes · TransferdeLuxe" };

export const dynamic = "force-dynamic";
const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const kpi = "rounded-xl border border-slate-700 bg-slate-900 p-4";

function ultimosMeses(n: number, desde: string): string[] {
  const [y, m] = desde.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return d.toISOString().slice(0, 7); });
}

function Tabla({ titulo, filas, nombre, conConsumo, conRechazos, csv }: { titulo: string; filas: FilaInforme[]; nombre: Map<string, string>; conConsumo?: boolean; conRechazos?: boolean; csv: string }) {
  return (
    <section className="overflow-x-auto">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <a href={csv} className="rounded border border-slate-600 px-3 py-1 text-sm hover:border-marca-claro">Exportar CSV</a>
      </div>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-slate-400"><tr>
          {[titulo.includes("vehículo") ? "Vehículo" : "Conductor", "Servicios", "Pasajeros", "Km estimados", "Litros", "Gasto", ...(conConsumo ? ["L/100 km"] : []), ...(conRechazos ? ["Rechazos"] : []), "Incidencias"]
            .map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {filas.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-slate-400">Sin datos este mes.</td></tr>}
          {filas.map((f) => (
            <tr key={f.id} className="border-t border-slate-700">
              <td className="px-2 py-1">{nombre.get(f.id) ?? "Sin asignar"}</td><td className="px-2">{f.servicios}</td><td className="px-2">{f.pasajeros}</td>
              <td className="px-2">{f.km.toLocaleString("es-ES")}{f.sinCoordenadas > 0 && <span className="text-xs text-slate-500"> ({f.sinCoordenadas} sin coord.)</span>}</td>
              <td className="px-2">{litros2(f.litros)}</td><td className="px-2">{euros(f.gasto)}</td>
              {conConsumo && <td className="px-2">{f.l100 == null ? "—" : f.l100.toLocaleString("es-ES", { minimumFractionDigits: 1 })}</td>}
              {conRechazos && <td className="px-2">{f.rechazos}</td>}
              <td className="px-2">{f.incidencias}</td>
            </tr>))}
        </tbody>
      </table>
    </section>
  );
}

export default async function Informes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("operador");
  if (!(await moduloInformesActivo())) notFound();
  const f = leerFiltro(await searchParams);
  const d = await cargarInforme(f);
  const nombre = new Map<string, string>([...d.vehiculos.map((v) => [v.id, v.matricula] as const), ...d.conductores.map((c) => [c.id, c.nombre] as const)]);
  const qs = new URLSearchParams({ mes: f.mes, ...(f.conductor ? { conductor: f.conductor } : {}), ...(f.vehiculo ? { vehiculo: f.vehiculo } : {}) });
  const t = d.totales;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-marca-claro">Informes · {mesLegible(f.mes)}</h1>
      {d.error && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">Error: {d.error.message}</p>}
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-400">Mes<br /><select name="mes" defaultValue={f.mes} className={campo}>
          {ultimosMeses(18, new Date().toISOString().slice(0, 7)).map((m) => <option key={m} value={m}>{mesLegible(m)}</option>)}</select></label>
        <label className="text-sm text-slate-400">Conductor<br /><select name="conductor" defaultValue={f.conductor ?? ""} className={campo}><option value="">Todos</option>
          {d.conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label className="text-sm text-slate-400">Vehículo<br /><select name="vehiculo" defaultValue={f.vehiculo ?? ""} className={campo}><option value="">Todos</option>
          {d.vehiculos.map((v) => <option key={v.id} value={v.id}>{v.matricula}</option>)}</select></label>
        <button className="rounded bg-marca px-3 py-1 text-sm font-medium text-white hover:bg-marca-oscuro">Ver</button>
      </form>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className={kpi}><p className="text-sm text-slate-400">Servicios completados</p><p data-kpi="servicios" className="text-2xl font-semibold">{t.servicios}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Pasajeros</p><p className="text-2xl font-semibold">{t.pasajeros}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Km estimados</p><p className="text-2xl font-semibold">{t.km.toLocaleString("es-ES")}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Combustible</p><p className="text-2xl font-semibold">{litros2(t.litros)}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Gasto combustible</p><p className="text-2xl font-semibold">{euros(t.gasto)}</p></div>
        <div className={kpi}><p className="text-sm text-slate-400">Rechazos / incidencias</p><p className="text-2xl font-semibold">{t.rechazos} / {t.incidencias}</p></div>
      </section>
      <p className="text-xs text-slate-500">Km estimados: distancia en línea recta entre origen y destino × 1,3 (no hay ruta guardada). L/100 km a partir de los km de los tickets.</p>

      <section className={kpi}><h2 className="mb-2 text-lg font-semibold">Servicios completados por día</h2><GraficoServicios datos={d.porDia} /></section>

      <Tabla titulo="Por vehículo" filas={d.porVehiculo} nombre={nombre} conConsumo csv={`/central/informes/csv?${qs}&por=vehiculo`} />
      <Tabla titulo="Por conductor" filas={d.porConductor} nombre={nombre} conRechazos csv={`/central/informes/csv?${qs}&por=conductor`} />
    </div>
  );
}
