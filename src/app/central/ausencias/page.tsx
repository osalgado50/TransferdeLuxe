import Link from "next/link";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { diaMadrid } from "@/lib/dominio/geo";
import {
  calendarioMes, diasDelMes, mesDe, sumarMeses, textoAusencia, COLOR_TIPO_AUSENCIA, NOMBRE_FRANJA, NOMBRE_TIPO_AUSENCIA, TIPOS_AUSENCIA, type Ausencia,
} from "@/lib/dominio/ausencias";
import { FormAusencia, ListaAusencias } from "@/components/central/GestionAusencias";
import { mesValido } from "@/lib/dominio/periodo";

export const metadata = { title: "Ausencias · TransferdeLuxe" };
export const dynamic = "force-dynamic";

const fmtMes = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const INICIAL = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Ausencias de los conductores (vacaciones, fiestas, días libres, bajas): alta/edición/borrado y calendario mensual de
 * toda la plantilla. En esos huecos la sugerencia y la asignación automática no los proponen («No disponible»).
 */
export default async function PaginaAusencias({ searchParams }: { searchParams: Promise<{ mes?: string; editar?: string }> }) {
  await exigirRol("operador");
  const q = await searchParams;
  const hoy = diaMadrid(new Date());
  const mes = mesValido(q.mes) ? q.mes : mesDe(hoy);
  const dias = diasDelMes(mes);
  const sb = clienteAdmin();
  const [{ data: gente }, { data: delMes }, { data: proximas }] = await Promise.all([
    sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").lte("desde", dias.at(-1)!).gte("hasta", dias[0]).limit(1000),
    sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").gte("hasta", hoy).order("desde").limit(200),
  ]);
  const conductores = (gente ?? []) as { id: string; nombre: string }[];
  const nombres = Object.fromEntries(conductores.map((c) => [c.id, c.nombre]));
  const ausMes = (delMes ?? []) as (Ausencia & { id: string })[];
  const editar = q.editar
    ? (((proximas ?? []) as (Ausencia & { id: string })[]).find((a) => a.id === q.editar) ?? ausMes.find((a) => a.id === q.editar)
      ?? ((await sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").eq("id", q.editar).maybeSingle()).data as (Ausencia & { id: string }) | null))
    : null;
  const cal = calendarioMes(mes, conductores, ausMes);
  const dow = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-marca-claro">Ausencias</h1>
      <p className="text-sm text-slate-400">Vacaciones, fiestas, días libres y bajas. En esos días (o en esa media jornada: mañana antes de las 14:00, tarde desde
        las 14:00) la sugerencia y la asignación automática no proponen al conductor; asignarlo a mano pide confirmación.</p>

      <FormAusencia key={editar?.id ?? "nueva"} conductores={conductores} editar={editar} hoy={hoy} />

      <section aria-label="Calendario de ausencias" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{((t) => t[0].toUpperCase() + t.slice(1))(fmtMes.format(new Date(`${mes}-15T12:00:00Z`)))}</h2>
          <nav className="flex gap-2 text-sm">
            <Link href={`/central/ausencias?mes=${sumarMeses(mes, -1)}`} className="rounded border border-slate-600 px-3 py-2">‹ Anterior</Link>
            <Link href="/central/ausencias" className="rounded border border-slate-600 px-3 py-2">Hoy</Link>
            <Link href={`/central/ausencias?mes=${sumarMeses(mes, 1)}`} className="rounded border border-slate-600 px-3 py-2">Siguiente ›</Link>
          </nav>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-slate-300">
          {TIPOS_AUSENCIA.map((t) => <li key={t} className="flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: COLOR_TIPO_AUSENCIA[t] }} />{NOMBRE_TIPO_AUSENCIA[t]}</li>)}
          <li className="flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: `linear-gradient(135deg, ${COLOR_TIPO_AUSENCIA.libre} 50%, transparent 50%)` }} />media jornada</li>
        </ul>
        <div className="max-w-full overflow-x-auto rounded-lg border border-slate-800">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-slate-900 px-2 py-1 text-left font-medium">Conductor</th>
                {dias.map((d) => (
                  <th key={d} scope="col" className={`w-7 min-w-7 px-0 py-1 text-center font-normal ${d === hoy ? "text-marca-claro" : dow(d) >= 5 ? "text-slate-500" : "text-slate-300"}`}>
                    <span className="block">{INICIAL[dow(d)]}</span><span className="block font-semibold">{Number(d.slice(8))}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conductores.map((c) => (
                <tr key={c.id} className="border-t border-slate-800">
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-slate-900 px-2 py-1 text-left font-medium">{c.nombre}</th>
                  {cal[c.id].map((x) => {
                    const a = x.ausencia;
                    const color = a ? COLOR_TIPO_AUSENCIA[a.tipo] : null;
                    const fondo = !color ? undefined : x.franja === "manana" ? `linear-gradient(135deg, ${color} 50%, transparent 50%)`
                      : x.franja === "tarde" ? `linear-gradient(135deg, transparent 50%, ${color} 50%)` : color;
                    const titulo = a ? `${c.nombre}: ${textoAusencia(a)}${x.franja && x.franja !== "dia" ? ` · ${NOMBRE_FRANJA[x.franja]}` : ""}${a.nota ? ` · ${a.nota}` : ""}` : undefined;
                    return (
                      <td key={x.dia} title={titulo} data-dia={x.dia} data-tipo={a?.tipo} className={`h-7 border-l border-slate-800 p-0 ${x.dia === hoy ? "ring-1 ring-inset ring-marca-claro" : ""}`}>
                        {a ? <a href={a.id ? `/central/ausencias?editar=${a.id}` : undefined} aria-label={titulo} className="block h-7 w-full" style={{ background: fondo }} /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Próximas ausencias" className="space-y-2">
        <h2 className="text-lg font-semibold">Próximas y en curso</h2>
        <ListaAusencias ausencias={(proximas ?? []) as (Ausencia & { id: string })[]} nombres={nombres} />
      </section>
    </div>
  );
}
