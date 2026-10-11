import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/supabase/sesion";
import { jornadasEnRango, modulosCentral, rangoDias } from "@/lib/central/modulosConductor";
import { formatoDuracion, registroPorDia } from "@/lib/dominio/jornada";

export const dynamic = "force-dynamic";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

export default async function Jornadas({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await exigirRol("operador");
  if (!(await modulosCentral()).jornada) notFound();
  const { desde, hasta } = rangoDias(await searchParams);
  const { jornadas, nombre } = await jornadasEnRango(desde, hasta);
  const filas = registroPorDia(jornadas, new Date());
  const total = new Map<string, number>();
  for (const f of filas) total.set(f.conductor_id, (total.get(f.conductor_id) ?? 0) + f.msTrabajado);
  const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Jornadas (registro horario)</h1>
      <p className="text-sm text-slate-400">Registro diario de jornada de los conductores (art. 34.9 del Estatuto de los Trabajadores). Independiente del estado «En servicio» del GPS.</p>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Desde <input type="date" name="desde" defaultValue={desde} className={campo} /></label>
        <label className="text-sm">Hasta <input type="date" name="hasta" defaultValue={hasta} className={campo} /></label>
        <button className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm">Filtrar</button>
        <Link href={`/central/jornadas/csv?desde=${desde}&hasta=${hasta}`} prefetch={false} className="rounded-lg bg-marca px-3 py-1.5 text-sm text-white">Exportar CSV</Link>
      </form>
      {total.size > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {[...total].map(([id, ms]) => <li key={id} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1">{nombre(id)}: <strong>{formatoDuracion(ms)}</strong></li>)}
        </ul>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr><th className="p-2">Fecha</th><th className="p-2">Conductor</th><th className="p-2">Entrada</th><th className="p-2">Salida</th><th className="p-2">Pausas</th><th className="p-2">Horas</th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className="p-3 text-slate-400">Sin jornadas en este periodo.</td></tr>}
            {filas.map((f) => (
              <tr key={`${f.conductor_id}-${f.dia}`} className="border-t border-slate-800">
                <td className="p-2">{f.dia.split("-").reverse().join("/")}</td>
                <td className="p-2">{nombre(f.conductor_id)}</td>
                <td className="p-2">{hora(f.entrada)}</td>
                <td className="p-2">{f.salida ? hora(f.salida) : <span className="text-green-400">en curso</span>}</td>
                <td className="p-2">{f.pausas} · {formatoDuracion(f.msPausa)}</td>
                <td className="p-2 font-semibold">{formatoDuracion(f.msTrabajado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
