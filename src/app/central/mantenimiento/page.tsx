import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";
import { diaMadrid } from "@/lib/dominio/geo";
import { estadoVehiculo, type PlanVehiculo, type Semaforo } from "@/lib/dominio/mantenimiento";
import { euros, fechaCorta } from "@/lib/dominio/formato";
import { guardarPlan, registrarMantenimiento } from "./actions";
import { SEMAFORO_CIERRE, etiquetaCombustible, etiquetaZona, problemasCierre, ultimoCierrePorVehiculo, type CierreJornada } from "@/lib/dominio/cierre";
import DiagramaVehiculo from "@/components/comun/DiagramaVehiculo";
import BotonCierreVisto from "@/components/central/BotonCierreVisto";

export const metadata = { title: "Mantenimiento · TransferdeLuxe" };

export const dynamic = "force-dynamic";

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const TIPOS = [["revision", "Revisión"], ["itv", "ITV"], ["aceite", "Aceite y filtros"], ["neumaticos", "Neumáticos"], ["frenos", "Frenos"], ["reparacion", "Reparación"], ["otro", "Otro"]] as const;
const COLOR: Record<Semaforo, string> = {
  rojo: "bg-red-900/60 text-red-200 border-red-700", amarillo: "bg-amber-900/50 text-amber-200 border-amber-700",
  verde: "bg-emerald-900/50 text-emerald-200 border-emerald-700", sin_datos: "bg-slate-800 text-slate-400 border-slate-700",
};
const TEXTO: Record<Semaforo, string> = { rojo: "Vencido", amarillo: "Próximo", verde: "Al día", sin_datos: "Sin datos" };

export default async function Mantenimiento({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("operador");
  const q = await searchParams;
  const sb = clienteAdmin();
  const { data: ajustes } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  if (!leerModulos(ajustes?.modulos).mantenimiento) notFound();
  const [{ data: vehiculos, error: e1 }, { data: planes, error: e2 }, { data: registros, error: e3 }, { data: cierres }, { data: gente }] = await Promise.all([
    sb.from("vehiculos").select("id,matricula,modelo,km_actuales").order("matricula"),
    sb.from("vehiculos_mantenimiento").select("*"),
    sb.from("mantenimientos").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(100),
    // Hojas de cierre de los últimos 60 días: la última de cada vehículo (estado para el día siguiente).
    sb.from("cierres_jornada").select("*").gte("creado_en", new Date(Date.now() - 60 * 86400e3).toISOString()).order("creado_en", { ascending: false }).limit(500),
    sb.from("perfiles").select("id,nombre"),
  ]);
  const ultimoCierre = ultimoCierrePorVehiculo((cierres ?? []) as CierreJornada[]);
  const nombre = new Map((gente ?? []).map((p) => [p.id as string, p.nombre as string]));
  const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const err = e1 ?? e2 ?? e3;
  const hoy = diaMadrid(new Date());
  const planPor = new Map((planes ?? []).map((p) => [p.vehiculo_id as string, p as PlanVehiculo]));
  const matricula = new Map((vehiculos ?? []).map((v) => [v.id, v.matricula]));
  const etiquetaTipo = new Map<string, string>(TIPOS);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-marca-claro">Mantenimiento</h1>
      {err && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">Error: {err.message}</p>}
      {q.error && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">{q.error}</p>}
      {q.ok && <p role="status" className="rounded bg-emerald-900/40 p-2 text-emerald-200">Guardado.</p>}

      <section className="grid gap-3 lg:grid-cols-2">
        {(vehiculos ?? []).map((v) => {
          const plan = planPor.get(v.id) ?? null;
          const e = estadoVehiculo(plan, v.km_actuales, hoy);
          return (
            <article key={v.id} data-vehiculo={v.matricula} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold">{v.matricula} <span className="text-sm font-normal text-slate-400">{v.modelo} · {v.km_actuales.toLocaleString("es-ES")} km</span></h2>
                <span data-semaforo={e.global} className={`rounded border px-2 py-0.5 text-xs ${COLOR[e.global]}`}>{TEXTO[e.global]}</span>
              </div>
              {(() => {
                const c = ultimoCierre.get(v.id);
                if (!c) return <p data-cierre="ninguno" className="mb-2 rounded border border-slate-700 px-2 py-1 text-sm text-slate-400">Último cierre: sin hojas de cierre</p>;
                const sem = SEMAFORO_CIERRE[c.gravedad];
                const problemas = problemasCierre(c);
                return (
                  <div data-cierre={c.gravedad} className={`mb-3 flex gap-3 rounded border p-2 text-sm ${COLOR[sem.color]}`}>
                    {c.zonas.length > 0 && <div className="w-16 shrink-0"><DiagramaVehiculo zonas={c.zonas} mini /></div>}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">Último cierre: {sem.texto}</span>
                        <span className="text-xs opacity-80">{fechaHora(c.creado_en)} · {nombre.get(c.conductor_id) ?? "Conductor"}</span>
                        {!c.visto && c.gravedad !== "ok" && <BotonCierreVisto id={c.id} />}</p>
                      {c.zonas.length > 0 && <p><span className="font-medium">Daños:</span> {c.zonas.map(etiquetaZona).join(", ")}</p>}
                      <p><span className="font-medium">Técnico:</span> {problemas.length ? problemas.join(" · ") : "todo OK"} · combustible {etiquetaCombustible(c.combustible)}{c.km != null ? ` · ${c.km.toLocaleString("es-ES")} km` : ""}</p>
                      {c.comentario && <p className="italic">«{c.comentario}»</p>}
                    </div>
                  </div>
                );
              })()}
              <ul className="mb-3 grid grid-cols-2 gap-1 text-sm">
                {e.items.map((i) => (
                  <li key={i.clave} className={`rounded border px-2 py-1 ${COLOR[i.semaforo]}`}><span className="font-medium">{i.etiqueta}:</span> {i.detalle}</li>
                ))}
              </ul>
              <details>
                <summary className="cursor-pointer text-sm text-slate-400 hover:text-marca-claro">Editar fechas y próxima revisión</summary>
                <form action={guardarPlan} className="mt-2 grid grid-cols-2 gap-2">
                  <input type="hidden" name="vehiculo_id" value={v.id} />
                  <label className="text-sm text-slate-400">ITV<br /><input type="date" name="itv_fecha" defaultValue={plan?.itv_fecha ?? ""} className={campo} /></label>
                  <label className="text-sm text-slate-400">Seguro vence<br /><input type="date" name="seguro_vence" defaultValue={plan?.seguro_vence ?? ""} className={campo} /></label>
                  <label className="text-sm text-slate-400">Revisión (fecha)<br /><input type="date" name="revision_fecha" defaultValue={plan?.revision_fecha ?? ""} className={campo} /></label>
                  <label className="text-sm text-slate-400">Revisión (km)<br /><input type="number" min={0} name="revision_km" defaultValue={plan?.revision_km ?? ""} className={campo} /></label>
                  <button className="col-span-2 rounded bg-marca px-3 py-1 text-sm font-medium text-white hover:bg-marca-oscuro">Guardar</button>
                </form>
              </details>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Registrar mantenimiento</h2>
        <form action={registrarMantenimiento} className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-400">Vehículo<br /><select name="vehiculo_id" required className={campo}><option value="">—</option>
            {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula}</option>)}</select></label>
          <label className="text-sm text-slate-400">Fecha<br /><input type="date" name="fecha" required defaultValue={hoy} className={campo} /></label>
          <label className="text-sm text-slate-400">Km<br /><input type="number" name="km" min={0} required className={`${campo} w-28`} /></label>
          <label className="text-sm text-slate-400">Tipo<br /><select name="tipo" className={campo}>{TIPOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className="text-sm text-slate-400">Descripción<br /><input name="descripcion" maxLength={500} className={campo} /></label>
          <label className="text-sm text-slate-400">Coste (€)<br /><input name="coste" inputMode="decimal" className={`${campo} w-24`} /></label>
          <label className="text-sm text-slate-400">Taller<br /><input name="taller" maxLength={120} className={campo} /></label>
          <button className="rounded bg-marca px-3 py-1 text-sm font-medium text-white hover:bg-marca-oscuro">Registrar</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Si los km son mayores que los actuales del vehículo, se actualizan.</p>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-2 text-lg font-semibold">Historial</h2>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-slate-400"><tr>{["Fecha", "Vehículo", "Km", "Tipo", "Descripción", "Coste", "Taller"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {(registros ?? []).length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-slate-400">Sin mantenimientos registrados.</td></tr>}
            {(registros ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-700">
                <td className="px-2 py-1">{fechaCorta(r.fecha)}</td><td className="px-2">{matricula.get(r.vehiculo_id) ?? "—"}</td>
                <td className="px-2">{Number(r.km).toLocaleString("es-ES")}</td><td className="px-2">{etiquetaTipo.get(r.tipo) ?? r.tipo}</td>
                <td className="px-2">{r.descripcion ?? "—"}</td><td className="px-2">{r.coste == null ? "—" : euros(Number(r.coste))}</td><td className="px-2">{r.taller ?? "—"}</td>
              </tr>))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
