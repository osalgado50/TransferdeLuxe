import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { modulosCentral } from "@/lib/central/modulosConductor";
import { fallos, type ItemChecklist, type Respuestas } from "@/lib/dominio/checklist";
import EditorChecklist from "@/components/central/EditorChecklist";
import { BotonRevisionVista } from "@/components/central/BotonResolver";

export const dynamic = "force-dynamic";

interface Rev { id: string; conductor_id: string; vehiculo_id: string; fecha: string; respuestas: Respuestas; observaciones: string; con_fallos: boolean; revisada: boolean }

export default async function Checklist() {
  await exigirRol("operador");
  if (!(await modulosCentral()).checklist) notFound();
  const sb = clienteAdmin();
  const [it, rv, pf, vh] = await Promise.all([
    sb.from("checklist_items").select("id,texto,orden,activo").order("orden"),
    sb.from("checklist_revisiones").select("id,conductor_id,vehiculo_id,fecha,respuestas,observaciones,con_fallos,revisada").order("creado_en", { ascending: false }).limit(60),
    sb.from("perfiles").select("id,nombre").eq("rol", "conductor"),
    sb.from("vehiculos").select("id,matricula"),
  ]);
  if (it.error || rv.error) throw new Error(`Checklist: ${(it.error ?? rv.error)!.message}`);
  const items = (it.data ?? []) as ItemChecklist[];
  const nombre = (id: string) => pf.data?.find((p) => p.id === id)?.nombre ?? "Conductor";
  const matricula = (id: string) => vh.data?.find((v) => v.id === id)?.matricula ?? "—";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Checklist del vehículo</h1>
      <p className="text-sm text-slate-400">El conductor lo rellena una vez al día por vehículo al iniciar la jornada (o antes de empezar si el módulo de jornada está desactivado). Lo marcado «mal» avisa en el panel.</p>
      <EditorChecklist items={items} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Revisiones recientes</h2>
        {(rv.data ?? []).length === 0 && <p className="text-sm text-slate-400">Aún no hay revisiones.</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-slate-400"><tr><th className="p-2">Fecha</th><th className="p-2">Conductor</th><th className="p-2">Vehículo</th><th className="p-2">Resultado</th><th className="p-2"></th></tr></thead>
            <tbody>
              {((rv.data ?? []) as Rev[]).map((r) => (
                <tr key={r.id} className="border-t border-slate-800 align-top">
                  <td className="p-2">{r.fecha.split("-").reverse().join("/")}</td>
                  <td className="p-2">{nombre(r.conductor_id)}</td>
                  <td className="p-2">{matricula(r.vehiculo_id)}</td>
                  <td className="p-2">
                    {r.con_fallos ? <span className="text-red-300">Mal: {fallos(r.respuestas, items).join(", ")}</span> : <span className="text-green-400">Todo bien</span>}
                    {r.observaciones && <p className="text-xs text-slate-400">{r.observaciones}</p>}
                  </td>
                  <td className="p-2">{!r.revisada && <BotonRevisionVista id={r.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
