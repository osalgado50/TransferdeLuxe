import MapaRecorrido from "@/components/mapa/MapaRecorridoCarga";
import { COLOR_CON, COLOR_HACIA, textoDuracion, textoKm, type RecorridoGuardado } from "@/lib/dominio/recorrido";

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

/** Bloque «Recorrido realizado»: mapa grande, km, duración y leyenda (central y conductor). */
export default function FichaRecorrido({ r }: { r: RecorridoGuardado }) {
  const conPax = r.km_con_pasajeros != null ? Number(r.km_con_pasajeros) : null;
  return (
    <section className="space-y-2" aria-labelledby="titulo-recorrido">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-recorrido" className="font-semibold text-marca-claro">Recorrido realizado</h2>
        <p className="text-sm text-slate-300">
          <b className="text-slate-100">{textoKm(r.km)}</b> · {textoDuracion(r.duracion_min)} · {hora.format(new Date(r.inicio))}–{hora.format(new Date(r.fin))}
        </p>
      </div>
      {r.puntos.length >= 2 ? <MapaRecorrido puntos={r.puntos} corte={r.corte} />
        : <p className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-400">No hay posiciones GPS de este viaje (el conductor no tenía el GPS activo).</p>}
      {r.puntos.length >= 2 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span><span className="mr-1 inline-block h-1 w-5 rounded align-middle" style={{ background: COLOR_HACIA }} />Hacia la recogida{conPax != null && ` · ${textoKm(Number(r.km) - conPax)}`}</span>
          {r.corte != null && <span><span className="mr-1 inline-block h-1 w-5 rounded align-middle" style={{ background: COLOR_CON }} />Con pasajeros{conPax != null && ` · ${textoKm(conPax)}`}</span>}
          <span>{r.puntos_originales} posiciones GPS</span>
        </p>
      )}
    </section>
  );
}
