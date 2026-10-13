import Link from "next/link";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { diaMadrid } from "@/lib/dominio/geo";
import { sumarDias } from "@/lib/dominio/dias";
import { cubre, type Ausencia } from "@/lib/dominio/ausencias";
import {
  agruparHorarios, leerTramos, lunesDeSemana, solapeVehiculo, textoTramos, tramosDelDia, tramosPintadosDia, INICIAL_DIA, NOMBRE_DIA, type Plantilla,
} from "@/lib/dominio/horarios";
import { EditorSemana, GestionExcepciones, GestionPlantillas } from "@/components/central/GestionHorarios";
import BarraTurno from "@/components/central/BarraTurno";

export const metadata = { title: "Horarios · TransferdeLuxe" };
export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Horarios de los conductores: semana tipo (continua o partida) con vehículo del turno, plantillas, cambios de un día y
 * vista semanal de toda la plantilla con las ausencias encima. Sin horario = disponible todo el día.
 */
export default async function PaginaHorarios({ searchParams }: { searchParams: Promise<{ c?: string; semana?: string }> }) {
  await exigirRol("operador");
  const q = await searchParams;
  const hoy = diaMadrid(new Date());
  const lunes = lunesDeSemana(q.semana && DIA.test(q.semana) ? q.semana : hoy);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const sb = clienteAdmin();
  const [gente, vehs, hor, plant, exc, aus, aj] = await Promise.all([
    sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("vehiculos").select("id,matricula,modelo,estado").order("matricula"),
    sb.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id,plantilla_id,actualizado_en").limit(5000),
    sb.from("plantillas_horario").select("id,nombre,tramos").order("nombre"),
    sb.from("excepciones_horario").select("conductor_id,fecha,tramos,nota").gte("fecha", hoy < lunes ? hoy : lunes).order("fecha").limit(2000),
    sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo").lte("desde", dias[6]).gte("hasta", dias[0]).limit(1000),
    sb.from("ajustes").select("base_texto,base_lat").eq("id", 1).maybeSingle(),
  ]);
  const fallo = [gente, vehs, hor, plant, exc].find((x) => x.error);
  if (fallo?.error) return <p role="alert" className="text-red-400">No se pudieron cargar los horarios: {fallo.error.message}</p>;
  const conductores = (gente.data ?? []) as { id: string; nombre: string; vehiculo_habitual_id: string | null }[];
  const vehiculos = (vehs.data ?? []) as { id: string; matricula: string; modelo: string; estado: string }[];
  const horarios = agruparHorarios(hor.data ?? [], exc.data ?? []);
  const plantillas: Plantilla[] = ((plant.data ?? []) as { id: string; nombre: string; tramos: unknown }[]).map((p) => ({ ...p, tramos: leerTramos(p.tramos) }));
  const ausencias = (aus.data ?? []) as Ausencia[];
  const nombre = new Map(conductores.map((c) => [c.id, c.nombre]));
  const matricula = new Map(vehiculos.map((v) => [v.id, v.matricula]));
  const sel = conductores.find((c) => c.id === q.c) ?? conductores[0] ?? null;
  const solapes = solapeVehiculo([...horarios].map(([conductorId, h]) => ({ conductorId, semana: h.semana })));
  const hSel = sel ? horarios.get(sel.id) : undefined;
  const claveEditor = sel ? `${sel.id}-${(hor.data ?? []).filter((x) => x.conductor_id === sel.id).map((x) => x.actualizado_en).sort().at(-1) ?? "nuevo"}` : "";
  const base = aj.data as { base_texto: string | null; base_lat: number | null } | null;
  const enlace = (extra: Record<string, string>) => `/central/horarios?${new URLSearchParams({ ...(sel ? { c: sel.id } : {}), semana: lunes, ...extra })}`;
  const fmtDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-marca-claro">Horarios</h1>
      <p className="text-sm text-slate-400">Perfil y horario de cada conductor: jornada continua de una hora a otra o partida (mañana y tarde con un rato para
        comer). El coche sale de la base y vuelve a ella al final de cada tramo; allí lo coge el siguiente conductor. La sugerencia, la
        asignación automática y la hoja de ruta no proponen a nadie fuera de turno, en su pausa o sin tiempo de volver a la base.
        Un conductor sin horario sigue disponible todo el día.</p>
      <p className="text-sm">
        {base?.base_texto
          ? <>Base / depósito: <b>{base.base_texto}</b>{base.base_lat == null && <span className="text-amber-300"> (sin coordenadas: no se calcula el traslado)</span>} · </>
          : <span className="text-amber-300">Sin base / depósito configurada: solo cuentan las horas, no el traslado desde/hasta la base. </span>}
        <Link href="/central/flota#base" className="text-marca-claro hover:underline">Cambiar en Flota y ajustes</Link>
      </p>

      {solapes.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-100" data-solapes={solapes.length}>
          <p className="font-semibold">⚠ Vehículo compartido en tramos que se solapan</p>
          <ul className="list-disc pl-5">
            {solapes.map((s, i) => (
              <li key={i}>{NOMBRE_DIA[s.diaSemana]}: {matricula.get(s.vehiculoId) ?? "vehículo"} lo tienen {nombre.get(s.a) ?? "?"} ({s.tramoA.inicio}–{s.tramoA.fin}) y {nombre.get(s.b) ?? "?"} ({s.tramoB.inicio}–{s.tramoB.fin}) a la vez. El relevo debe ser en la base, uno al terminar y otro al empezar.</li>
            ))}
          </ul>
        </div>
      )}

      {/* Vista de la semana de toda la plantilla, arriba: lo primero que se consulta. */}
      <section aria-label="Semana de la plantilla" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Semana del {fmtDia.format(new Date(`${dias[0]}T12:00:00Z`))} al {fmtDia.format(new Date(`${dias[6]}T12:00:00Z`))}</h2>
          <nav className="flex gap-2 text-sm">
            <Link href={enlace({ semana: sumarDias(lunes, -7) })} className="rounded border border-slate-600 px-3 py-2">‹ Anterior</Link>
            <Link href={enlace({ semana: lunesDeSemana(hoy) })} className="rounded border border-slate-600 px-3 py-2">Esta semana</Link>
            <Link href={enlace({ semana: sumarDias(lunes, 7) })} className="rounded border border-slate-600 px-3 py-2">Siguiente ›</Link>
          </nav>
        </div>
        <p className="text-xs text-slate-400">Verde: en turno · rayado: fuera de turno (incluida la pausa de comida) · color: ausencia (vacaciones, fiesta…).
          Cambio de un día marcado con ✎.</p>
        <div className="max-w-full overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-slate-900 px-2 py-1 text-left font-medium">Conductor</th>
                {dias.map((d, i) => (
                  <th key={d} scope="col" className={`px-1 py-1 text-center font-normal ${d === hoy ? "text-marca-claro" : "text-slate-300"}`}>
                    {INICIAL_DIA[i + 1]} {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conductores.map((c) => {
                const h = horarios.get(c.id);
                return (
                  <tr key={c.id} className="border-t border-slate-800" data-fila-conductor={c.id}>
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-slate-900 px-2 py-1 text-left font-medium">
                      <Link href={enlace({ c: c.id })} className="hover:underline">{c.nombre}</Link>
                    </th>
                    {dias.map((d) => {
                      const t = tramosDelDia(h, d);
                      const del = ausencias.filter((a) => a.conductor_id === c.id && cubre(a, d));
                      const a = del.find((x) => x.franja === "dia") ?? del[0] ?? null;
                      const veh = t.vehiculoId ? matricula.get(t.vehiculoId) : null;
                      return (
                        <td key={d} data-dia={d} className={`w-[12%] border-l border-slate-800 px-1.5 py-1 align-top ${d === hoy ? "bg-slate-900/60" : ""}`}
                          title={t.restringido ? `${textoTramos(t.tramos)}${t.restringido && t.fuente === "excepcion" ? " (cambio de ese día)" : ""}` : "Sin horario"}>
                          <BarraTurno tramos={t.restringido ? t.tramos : null} pintar={tramosPintadosDia(h, d)} ausencia={a ? { tipo: a.tipo, franja: a.franja } : null} />
                          {t.restringido && t.fuente === "excepcion" && <span className="text-[10px] text-sky-300">✎ cambio</span>}
                          {veh && <span className="block text-[10px] text-slate-500">🚐 {veh}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {conductores.length === 0 ? <p className="text-slate-400">No hay conductores.</p> : (
        <>
          <nav aria-label="Conductor" className="flex flex-wrap gap-2">
            {conductores.map((c) => (
              <Link key={c.id} href={enlace({ c: c.id })} aria-current={c.id === sel?.id ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${c.id === sel?.id ? "border-marca-claro bg-marca/20 text-marca-claro" : "border-slate-600 hover:border-marca-claro"}`}>
                {c.nombre}{horarios.get(c.id)?.semana.length ? "" : " · sin horario"}
              </Link>
            ))}
          </nav>
          {sel && <EditorSemana key={claveEditor} conductor={sel} semana={hSel?.semana ?? []} plantillas={plantillas} vehiculos={vehiculos} tieneHorario={!!hSel?.semana.length} />}
          {sel && <GestionExcepciones key={`ex-${sel.id}`} conductor={sel} hoy={hoy} excepciones={(hSel?.excepciones ?? []).filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))} />}
        </>
      )}

      <GestionPlantillas plantillas={plantillas} />

    </div>
  );
}
