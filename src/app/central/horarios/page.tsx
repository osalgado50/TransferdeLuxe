import Link from "next/link";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { diaMadrid } from "@/lib/dominio/geo";
import { sumarDias } from "@/lib/dominio/dias";
import { cubre, NOMBRE_TIPO_AUSENCIA, type Ausencia } from "@/lib/dominio/ausencias";
import {
  agruparHorarios, leerTramos, lunesDeSemana, solapeVehiculo, textoTramos, tramosDelDia, tramosPintadosDia, INICIAL_DIA, NOMBRE_DIA, type Plantilla,
} from "@/lib/dominio/horarios";
import { EditorSemana, GestionExcepciones, GestionPlantillas } from "@/components/central/GestionHorarios";
import PlanMes, { type CeldaMes } from "@/components/central/PlanMes";
import { diasDelMes, esMes, mesAnterior, mesSiguiente, nombreMes, solapesVehiculoFechas } from "@/lib/dominio/planHorarios";
import BarraTurno from "@/components/central/BarraTurno";
import { diaValido, mesValido } from "@/lib/dominio/periodo";

export const metadata = { title: "Horarios · TransferdeLuxe" };
export const dynamic = "force-dynamic";


/**
 * Horarios de los conductores: semana tipo (continua o partida) con vehículo del turno, plantillas, planificación por
 * fechas (solo una semana, el mes día a día, copiar a los meses siguientes, repetir semanas), cambios de un día y vistas de
 * semana y de mes de toda la plantilla con las ausencias encima. Sin horario = disponible todo el día.
 */
export default async function PaginaHorarios({ searchParams }: { searchParams: Promise<{ c?: string; semana?: string; vista?: string; mes?: string; editar?: string }> }) {
  await exigirRol("operador");
  const q = await searchParams;
  const hoy = diaMadrid(new Date());
  const vista = q.vista === "mes" ? "mes" : "semana";
  const semanaQ = diaValido(q.semana) ? q.semana : null;
  const lunes = lunesDeSemana(semanaQ ?? hoy);
  // Mes de la vista de mes: el pedido; si no, el de la semana que se estaba viendo (su jueves).
  const mes = q.mes && esMes(q.mes) && mesValido(q.mes) ? q.mes : sumarDias(lunes, 3).slice(0, 7);
  const editarTipo = q.editar === "tipo";
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const diasMes = diasDelMes(mes);
  // Días con fecha que se leen: los de la vista (desde la víspera, por la madrugada de los turnos de noche).
  const rango = vista === "mes" ? { desde: sumarDias(diasMes[0], -1), hasta: diasMes[diasMes.length - 1] } : { desde: sumarDias(lunes, -1), hasta: dias[6] };
  const sb = clienteAdmin();
  const [gente, vehs, hor, plant, exc, aus, aj] = await Promise.all([
    sb.from("perfiles").select("id,nombre,vehiculo_habitual_id").or(FILTRO_CONDUCEN).order("nombre"),
    sb.from("vehiculos").select("id,matricula,modelo,estado").order("matricula"),
    sb.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id,plantilla_id,actualizado_en").limit(5000),
    sb.from("plantillas_horario").select("id,nombre,tramos").order("nombre"),
    sb.from("excepciones_horario").select("conductor_id,fecha,tramos,nota,vehiculo_id,tipo").gte("fecha", rango.desde).lte("fecha", rango.hasta).order("fecha").limit(10000),
    sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo").lte("desde", rango.hasta).gte("hasta", rango.desde).limit(2000),
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
  const solapes = editarTipo ? solapeVehiculo([...horarios].map(([conductorId, h]) => ({ conductorId, semana: h.semana }))) : [];
  const fmtDia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  const textoSolape = (s: { fecha: string; vehiculoId: string; a: string; b: string; tramoA: { inicio: string; fin: string }; tramoB: { inicio: string; fin: string } }) =>
    `${fmtDia.format(new Date(`${s.fecha}T12:00:00Z`))}: ${matricula.get(s.vehiculoId) ?? "vehículo"} lo tienen ${nombre.get(s.a) ?? "?"} (${s.tramoA.inicio}–${s.tramoA.fin}) y ${nombre.get(s.b) ?? "?"} (${s.tramoB.inicio}–${s.tramoB.fin}) a la vez`;
  const solapesFecha = solapesVehiculoFechas(horarios, vista === "mes" ? diasMes : dias).map((s) => ({ fecha: s.fecha, texto: textoSolape(s) }));
  const hSel = sel ? horarios.get(sel.id) : undefined;
  // La semana vista del conductor elegido: la semana concreta que se edita.
  const semanaSel = dias.map((d) => tramosDelDia(hSel, d));
  const planificada = semanaSel.some((t) => t.restringido && t.fuente === "plan");
  const diasSemanaConcreta = semanaSel.map((t, i) => ({ dia_semana: i + 1, tramos: t.restringido ? t.tramos : [], vehiculo_id: t.vehiculoId, plantilla_id: null }));
  const marcaPlan = (hSel?.excepciones ?? []).filter((e) => e.fecha >= dias[0] && e.fecha <= dias[6]).map((e) => `${e.fecha}${e.tipo}${JSON.stringify(e.tramos)}${e.vehiculo_id}`).join("|");
  const claveEditor = sel ? `${sel.id}-${editarTipo ? "tipo" : lunes}-${(hor.data ?? []).filter((x) => x.conductor_id === sel.id).map((x) => x.actualizado_en).sort().at(-1) ?? "nuevo"}-${marcaPlan}` : "";
  const base = aj.data as { base_texto: string | null; base_lat: number | null } | null;
  const enlace = (extra: Record<string, string>) => `/central/horarios?${new URLSearchParams({ ...(sel ? { c: sel.id } : {}), vista, semana: lunes, mes, ...(editarTipo ? { editar: "tipo" } : {}), ...extra })}`;
  // Cambios puntuales próximos del conductor elegido (la lista de «Cambios de un día»).
  const { data: cambios } = sel
    ? await sb.from("excepciones_horario").select("fecha,tramos,nota").eq("conductor_id", sel.id).eq("tipo", "cambio").gte("fecha", hoy).order("fecha").limit(100)
    : { data: [] };
  // Vista de mes: lo que toca cada día a cada conductor.
  const celdas: Record<string, Record<string, CeldaMes>> = {};
  if (vista === "mes") {
    for (const c of conductores) {
      const h = horarios.get(c.id);
      celdas[c.id] = Object.fromEntries(diasMes.map((d) => {
        const t = tramosDelDia(h, d);
        const a = ausencias.filter((x) => x.conductor_id === c.id && cubre(x, d)).sort((x) => (x.franja === "dia" ? -1 : 1))[0];
        return [d, {
          tramos: t.restringido ? t.tramos : null, pintar: tramosPintadosDia(h, d), fuente: t.restringido ? t.fuente : null,
          vehiculoId: t.vehiculoId, nota: t.restringido ? t.nota : null, ausencia: a ? NOMBRE_TIPO_AUSENCIA[a.tipo] : null,
        } satisfies CeldaMes];
      }));
    }
  }

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

      {/* Semana o mes de toda la plantilla, arriba: lo primero que se consulta. */}
      <nav aria-label="Vista" className="flex flex-wrap gap-2 text-sm">
        {(["semana", "mes"] as const).map((v) => (
          <Link key={v} href={enlace({ vista: v })} aria-current={vista === v ? "page" : undefined}
            className={`rounded-lg border px-4 py-2 ${vista === v ? "border-marca-claro bg-marca/20 text-marca-claro" : "border-slate-600 hover:border-marca-claro"}`}>
            {v === "semana" ? "Semana" : "Mes (planificar)"}
          </Link>
        ))}
      </nav>

      {vista === "semana" ? (
        <section aria-label="Semana de la plantilla" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Semana del {fmtDia.format(new Date(`${dias[0]}T12:00:00Z`))} al {fmtDia.format(new Date(`${dias[6]}T12:00:00Z`))}</h2>
            <nav className="flex gap-2 text-sm">
              {[["‹ Anterior", sumarDias(lunes, -7)], ["Esta semana", lunesDeSemana(hoy)], ["Siguiente ›", sumarDias(lunes, 7)]].map(([t, l]) => (
                <Link key={t} href={enlace({ semana: l, mes: sumarDias(l, 3).slice(0, 7) })} className="rounded border border-slate-600 px-3 py-2">{t}</Link>
              ))}
            </nav>
          </div>
          <p className="text-xs text-slate-400">Verde: en turno · rayado: fuera de turno (incluida la pausa de comida) · color: ausencia (vacaciones, fiesta…) ·
            📅 planificado para ese día · ✎ cambio puntual · sin marca: sale de la semana tipo.</p>
          {solapesFecha.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-100" data-solapes-semana={solapesFecha.length}>
              <p className="font-semibold">⚠ Vehículo compartido a la vez</p>
              <ul className="list-disc pl-5">{solapesFecha.map((x, i) => <li key={i}>{x.texto}. El relevo debe ser en la base, uno al terminar y otro al empezar.</li>)}</ul>
            </div>
          )}
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
                          <td key={d} data-dia={d} data-fuente={t.restringido ? t.fuente : "sin"} className={`w-[12%] border-l border-slate-800 px-1.5 py-1 align-top ${d === hoy ? "bg-slate-900/60" : ""}`}
                            title={t.restringido ? `${textoTramos(t.tramos)}${t.fuente === "excepcion" ? " (cambio de ese día)" : t.fuente === "plan" ? " (planificado)" : ""}` : "Sin horario"}>
                            <BarraTurno tramos={t.restringido ? t.tramos : null} pintar={tramosPintadosDia(h, d)} ausencia={a ? { tipo: a.tipo, franja: a.franja } : null} />
                            {t.restringido && t.fuente === "excepcion" && <span className="text-[10px] text-sky-300">✎ cambio</span>}
                            {t.restringido && t.fuente === "plan" && <span className="text-[10px] text-sky-300">📅 planificado</span>}
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
      ) : (
        <section aria-label="Mes de la plantilla" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold first-letter:uppercase">{nombreMes(mes)}</h2>
            <nav className="flex gap-2 text-sm">
              {[["‹ Anterior", mesAnterior(mes)], ["Este mes", hoy.slice(0, 7)], ["Siguiente ›", mesSiguiente(mes)]].map(([t, m]) => (
                <Link key={t} href={enlace({ mes: m, semana: lunesDeSemana(`${m}-01`) < `${m}-01` ? sumarDias(lunesDeSemana(`${m}-01`), 7) : `${m}-01` })} className="rounded border border-slate-600 px-3 py-2">{t}</Link>
              ))}
            </nav>
          </div>
          {conductores.length === 0 ? <p className="text-slate-400">No hay conductores.</p> : (
            <PlanMes key={mes} mes={mes} dias={diasMes} hoy={hoy} conductores={conductores.map((c) => ({ id: c.id, nombre: c.nombre }))} celdas={celdas}
              vehiculos={vehiculos} plantillas={plantillas} solapes={solapesFecha} />
          )}
        </section>
      )}

      {vista === "semana" && (conductores.length === 0 ? <p className="text-slate-400">No hay conductores.</p> : (
        <>
          <nav aria-label="Conductor" className="flex flex-wrap gap-2">
            {conductores.map((c) => (
              <Link key={c.id} href={enlace({ c: c.id })} aria-current={c.id === sel?.id ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${c.id === sel?.id ? "border-marca-claro bg-marca/20 text-marca-claro" : "border-slate-600 hover:border-marca-claro"}`}>
                {c.nombre}{horarios.get(c.id)?.semana.length ? "" : " · sin horario"}
              </Link>
            ))}
          </nav>
          {sel && (
            <nav aria-label="Qué editar" className="flex flex-wrap gap-2 text-sm">
              <Link href={enlace({ editar: "" })} aria-current={!editarTipo ? "page" : undefined}
                className={`rounded-lg border px-3 py-2 ${!editarTipo ? "border-sky-400 bg-sky-900/40 text-sky-100" : "border-slate-600"}`}>
                Solo la semana del {fmtDia.format(new Date(`${dias[0]}T12:00:00Z`))} al {fmtDia.format(new Date(`${dias[6]}T12:00:00Z`))}
              </Link>
              <Link href={enlace({ editar: "tipo" })} aria-current={editarTipo ? "page" : undefined}
                className={`rounded-lg border px-3 py-2 ${editarTipo ? "border-marca-claro bg-marca/20 text-marca-claro" : "border-slate-600"}`}>
                Semana tipo (todas las semanas)
              </Link>
            </nav>
          )}
          {editarTipo && solapes.length > 0 && (
            <div role="alert" className="space-y-1 rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-100" data-solapes={solapes.length}>
              <p className="font-semibold">⚠ Vehículo compartido en tramos que se solapan (semana tipo)</p>
              <ul className="list-disc pl-5">
                {solapes.map((x, i) => (
                  <li key={i}>{NOMBRE_DIA[x.diaSemana]}: {matricula.get(x.vehiculoId) ?? "vehículo"} lo tienen {nombre.get(x.a) ?? "?"} ({x.tramoA.inicio}–{x.tramoA.fin}) y {nombre.get(x.b) ?? "?"} ({x.tramoB.inicio}–{x.tramoB.fin}) a la vez. El relevo debe ser en la base, uno al terminar y otro al empezar.</li>
                ))}
              </ul>
            </div>
          )}
          {sel && (editarTipo
            ? <EditorSemana key={claveEditor} conductor={sel} semana={hSel?.semana ?? []} plantillas={plantillas} vehiculos={vehiculos} tieneHorario={!!hSel?.semana.length} />
            : <EditorSemana key={claveEditor} conductor={sel} semana={diasSemanaConcreta} plantillas={plantillas} vehiculos={vehiculos} tieneHorario={!!hSel?.semana.length}
                concreta={{ lunes, etiqueta: `${fmtDia.format(new Date(`${dias[0]}T12:00:00Z`))}–${fmtDia.format(new Date(`${dias[6]}T12:00:00Z`))}`, planificada }} />)}
          {sel && <GestionExcepciones key={`ex-${sel.id}`} conductor={sel} hoy={hoy}
            excepciones={((cambios ?? []) as { fecha: string; tramos: unknown; nota: string | null }[]).map((e) => ({ fecha: e.fecha, tramos: leerTramos(e.tramos), nota: e.nota }))} />}
        </>
      ))}

      <GestionPlantillas plantillas={plantillas} />

    </div>
  );
}
