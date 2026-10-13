import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { leerModulos } from "@/lib/dominio/modulos";
import { rangosJornada, type Jornada } from "@/lib/dominio/jornada";
import { cierreObligatorio, etiquetaZona, normalizarZonas } from "@/lib/dominio/cierre";
import { acumuladoDelDia, esIncidenciaGrave, nombreTipoIncidencia } from "@/lib/dominio/incidencias";
import JornadaConductor from "@/components/conductor/JornadaConductor";
import BotonIncidencia from "@/components/conductor/BotonIncidencia";
import { diaMadrid } from "@/lib/dominio/geo";
import { proximasAusencias, textoAusencia, type Ausencia } from "@/lib/dominio/ausencias";
import { agruparHorarios, textoHorarioHoy } from "@/lib/dominio/horarios";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

/** Página de la jornada (PWA): iniciar (enciende el GPS), pausa, finalizar con hoja de cierre (lo apaga) e incidencias del día. */
export default async function PaginaJornada() {
  const yo = await exigirConductor();
  const sb = await clienteServidor();
  const { data: aj } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  const m = leerModulos(aj?.modulos);
  const r = rangosJornada(new Date());
  const hoy = diaMadrid(new Date());
  const [jor, vehs, inc, aus, hor, exc] = await Promise.all([
    m.jornada ? sb.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").eq("conductor_id", yo.id).or(`fin.is.null,fin.gte.${r.semana.desde}`).order("inicio") : Promise.resolve({ data: [] }),
    m.jornada && cierreObligatorio(m) ? sb.from("vehiculos").select("id,matricula,modelo,km_actuales").eq("estado", "activo").order("matricula") : Promise.resolve({ data: [] }),
    sb.from("incidencias").select("id,tipo,zonas,descripcion,creado_en,resuelta").eq("conductor_id", yo.id).gte("creado_en", r.hoy.desde).order("creado_en", { ascending: false }),
    // Próximas ausencias (vacaciones, fiestas…) que ha marcado la central: solo lectura. Si la tabla falla, nada.
    sb.from("ausencias").select("id,conductor_id,desde,hasta,franja,tipo,nota").eq("conductor_id", yo.id).gte("hasta", hoy).order("desde").limit(10),
    // Su horario (semana tipo + cambio de hoy), solo lectura. Sin horario o si la tabla falla: no se muestra nada.
    sb.from("horarios_conductor").select("conductor_id,dia_semana,tramos,vehiculo_id").eq("conductor_id", yo.id),
    sb.from("excepciones_horario").select("conductor_id,fecha,tramos,nota").eq("conductor_id", yo.id).eq("fecha", hoy),
  ]);
  const horarioHoy = textoHorarioHoy(agruparHorarios(hor.data ?? [], exc.data ?? []).get(yo.id), hoy);
  const ausencias = proximasAusencias((aus.data ?? []) as Ausencia[], hoy);
  const vehiculos = (vehs.data ?? []) as { id: string; matricula: string; modelo: string; km_actuales: number }[];
  const incidencias = (inc.data ?? []) as { id: string; tipo: string; zonas: string[] | null; descripcion: string; creado_en: string; resuelta: boolean }[];
  const acumulado = acumuladoDelDia(incidencias, hora);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Jornada</h1>
      {horarioHoy && <p data-horario-hoy className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-lg font-semibold">🕒 {horarioHoy}</p>}
      {m.jornada
        ? <JornadaConductor jornadas={(jor.data ?? []) as Jornada[]} acumulado={acumulado} conductorId={yo.id}
            cierre={vehiculos.length > 0 ? { vehiculos, vehiculoInicial: yo.vehiculo_habitual_id ?? null } : null} />
        : <p className="text-slate-400">El registro de jornada está desactivado por la central.</p>}
      {(
        <section aria-label="Próximas ausencias" className="space-y-2">
          <h2 className="pt-2 text-xl font-semibold text-marca-claro">Próximas ausencias</h2>
          {ausencias.length === 0 ? <p className="text-slate-400">Ninguna marcada por la central.</p> : <ul className="space-y-2">
            {ausencias.map((a) => (
              <li key={a.id ?? `${a.desde}-${a.tipo}`} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                <p className="font-semibold">{textoAusencia(a)}</p>
                {a.nota && <p className="text-sm text-slate-400">{a.nota}</p>}
              </li>
            ))}
          </ul>}
        </section>
      )}
      {m.incidencias && (
        <section aria-label="Incidencias" className="space-y-3">
          <h2 className="pt-2 text-xl font-semibold text-marca-claro">Incidencias</h2>
          <BotonIncidencia grande />
          <p className="text-sm text-slate-400">Avería, accidente o golpe: llegan a la central al momento, con alarma.</p>
          <h3 className="font-semibold">Incidencias de hoy</h3>
          {incidencias.length === 0 ? <p className="text-slate-400">Ninguna.</p> : (
            <ul className="space-y-2">
              {incidencias.map((i) => {
                const zonas = normalizarZonas(i.zonas ?? []);
                return (
                  <li key={i.id} className={`rounded-xl border bg-slate-900 p-3 ${esIncidenciaGrave(i.tipo) ? "border-red-500" : "border-slate-700"}`}>
                    <p className="font-semibold">{hora(i.creado_en)} · {nombreTipoIncidencia(i.tipo)}{i.resuelta ? " · resuelta" : ""}</p>
                    {zonas.length > 0 && <p className="text-sm font-medium text-red-200">Daños: {zonas.map(etiquetaZona).join(", ")}</p>}
                    {i.descripcion && <p className="line-clamp-3 text-sm text-slate-300">{i.descripcion}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
