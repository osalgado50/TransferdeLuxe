import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/supabase/sesion";
import { jornadasEnRango, modulosCentral, rangoDias } from "@/lib/central/modulosConductor";
import { estadoJornada, formatoDuracion, registroPorDia, type Jornada } from "@/lib/dominio/jornada";
import JornadasAhora, { type FilaJornadaAhora } from "@/components/central/JornadasAhora";
import { clienteServidor } from "@/lib/supabase/servidor";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { detallePorDia, HORAS_JORNADA_LARGA, salidaConDia } from "@/lib/dominio/jornadaLarga";

export const metadata = { title: "Jornadas · TransferdeLuxe" };

export const dynamic = "force-dynamic";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

export default async function Jornadas({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await exigirRol("operador");
  if (!(await modulosCentral()).jornada) notFound();
  const { desde, hasta } = rangoDias(await searchParams);
  const sb = await clienteServidor();
  // Estado de ahora de cada conductor (para «Empezar / Terminar jornada» desde la central), en paralelo con el registro.
  const [{ jornadas, nombre }, { data: gente }, { data: abiertas }] = await Promise.all([
    jornadasEnRango(desde, hasta),
    sb.from("perfiles").select("id,nombre,rol").or(FILTRO_CONDUCEN).neq("rol", "baja").order("nombre"),
    sb.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").is("fin", null),
  ]);
  const abiertaDe = new Map(((abiertas ?? []) as Jornada[]).map((j) => [j.conductor_id, j]));
  const ahoraFilas: FilaJornadaAhora[] = (gente ?? []).map((g) => {
    const j = abiertaDe.get(g.id as string) ?? null;
    const estado = estadoJornada(j);
    const pausa = j?.pausas.find((x) => !x.fin);
    return { id: g.id as string, nombre: g.nombre as string, estado, desde: estado === "en_pausa" ? pausa!.inicio : j?.inicio ?? null };
  });
  const ahora = new Date();
  const filas = registroPorDia(jornadas, ahora);
  // Nº de jornadas del día y aviso de jornada abierta / demasiado larga (> 14 h): ¿se olvidó de cerrarla?
  const detalle = detallePorDia(jornadas, ahora.getTime());
  const conAviso = [...detalle.values()].filter((d) => d.aviso).length;
  const total = new Map<string, number>();
  for (const f of filas) total.set(f.conductor_id, (total.get(f.conductor_id) ?? 0) + f.msTrabajado);
  const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Jornadas (registro horario)</h1>
      <p className="text-sm text-slate-400">Registro diario de jornada de los conductores (art. 34.9 del Estatuto de los Trabajadores). Independiente del estado «En servicio» del GPS.</p>
      <JornadasAhora filas={ahoraFilas} />
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Desde <input type="date" name="desde" defaultValue={desde} className={campo} /></label>
        <label className="text-sm">Hasta <input type="date" name="hasta" defaultValue={hasta} className={campo} /></label>
        <button className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm">Filtrar</button>
        <Link href={`/central/jornadas/csv?desde=${desde}&hasta=${hasta}`} prefetch={false} className="rounded-lg bg-marca px-3 py-1.5 text-sm text-white">Exportar CSV</Link>
      </form>
      {conAviso > 0 && (
        <p role="status" className="rounded-lg border border-amber-600 bg-amber-950/50 px-3 py-2 text-sm text-amber-100">
          ⏳ {conAviso === 1 ? "Hay 1 día" : `Hay ${conAviso} días`} con una jornada de más de {HORAS_JORNADA_LARGA} h (abierta o cerrada tarde): revisa si el conductor se olvidó de cerrarla.
        </p>
      )}
      <p className="text-xs text-slate-500">Una fila por conductor y día: entrada = la primera del día, salida = la última; «Tiempo trabajado» suma todas las jornadas de ese día sin las pausas. Si la salida es otro día se indica «(+1 día)» o la fecha.</p>
      {total.size > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {[...total].map(([id, ms]) => <li key={id} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1">{nombre(id)}: <strong>{formatoDuracion(ms)}</strong></li>)}
        </ul>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr><th className="p-2">Fecha</th><th className="p-2">Conductor</th><th className="p-2">Entrada (primera)</th><th className="p-2">Salida (última)</th><th className="p-2">Pausas</th><th className="p-2">Tiempo trabajado</th></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={6} className="p-3 text-slate-400">Sin jornadas en este periodo.</td></tr>}
            {filas.map((f) => {
              const d = detalle.get(`${f.conductor_id}|${f.dia}`);
              return (
                <tr key={`${f.conductor_id}-${f.dia}`} className={`border-t border-slate-800 ${d?.aviso ? "bg-amber-950/30" : ""}`}>
                  <td className="p-2">{f.dia.split("-").reverse().join("/")}</td>
                  <td className="p-2">
                    {nombre(f.conductor_id)}
                    {f.porCentral && <span title="La central empezó o terminó alguna jornada de este día" className="ml-2 rounded-full bg-sky-900 px-2 py-0.5 text-xs text-sky-200">✎ central</span>}
                    {d?.aviso && <span data-aviso-jornada className="mt-1 block w-fit rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-slate-950">⏳ {d.aviso}</span>}
                  </td>
                  <td className="p-2">{hora(f.entrada)}</td>
                  <td className="p-2">{f.salida ? salidaConDia(f.entrada, f.salida) : <span className="text-green-400">en curso</span>}</td>
                  <td className="p-2">{f.pausas} · {formatoDuracion(f.msPausa)}</td>
                  <td className="p-2 font-semibold">
                    {formatoDuracion(f.msTrabajado)}
                    {d && d.jornadas > 1 && <span className="block text-xs font-normal text-slate-400">suma de {d.jornadas} jornadas</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
