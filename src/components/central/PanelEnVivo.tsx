"use client";
import { useCallback, useRef, useState } from "react";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import type { PosicionActual, Servicio, Perfil, Vehiculo } from "@/lib/dominio/tipos";
import type { AlertaHorarioAct, CierreAct, IncidenciaAct, JornadaAct, RevisionAct, ServicioAct } from "@/lib/dominio/actividad";
import MapaFlota from "@/components/mapa/MapaFlotaCarga";
import ColumnaAlertas, { type EventoAlerta } from "./ColumnaAlertas";
import Contadores from "./Contadores";
import AlertasGraves from "./AlertasGraves";
import AvisosAtencion from "./AvisosAtencion";
import ActividadEnVivo from "./ActividadEnVivo";
import { useSonidosCentral } from "./useSonidosCentral";
import { useActividadCentral } from "./useActividadCentral";

const SIN_ALERTAS: AlertaHorarioAct[] = [];

export default function PanelEnVivo({ servicios, posiciones, eventos, conductores, vehiculos, umbralMin, incidencias, revisiones, jornadas, cierres, serviciosExtra, alertasHorario = SIN_ALERTAS }: {
  servicios: Servicio[]; posiciones: PosicionActual[]; eventos: EventoAlerta[];
  conductores: (Pick<Perfil, "id" | "nombre" | "vehiculo_habitual_id"> & { telefono?: string | null })[]; vehiculos: Pick<Vehiculo, "id" | "matricula">[]; umbralMin: number;
  incidencias: IncidenciaAct[]; revisiones: RevisionAct[]; jornadas: JornadaAct[]; cierres: CierreAct[]; serviciosExtra: ServicioAct[];
  alertasHorario?: AlertaHorarioAct[];
}) {
  const [ok, setOk] = useState(true);
  const sv = useTiempoReal<Servicio>("servicios", servicios, "id", setOk);
  const ps = useTiempoReal<PosicionActual>("posicion_actual", posiciones, "conductor_id");
  const ev = useTiempoReal<EventoAlerta>("eventos_servicio", eventos, "id");
  const inc = useTiempoReal<IncidenciaAct>("incidencias", incidencias, "id");
  const rev = useTiempoReal<RevisionAct>("checklist_revisiones", revisiones, "id");
  const jor = useTiempoReal<JornadaAct>("jornadas", jornadas, "id");
  const cie = useTiempoReal<CierreAct>("cierres_jornada", cierres, "id");
  const alh = useTiempoReal<AlertaHorarioAct>("alertas_horario", alertasHorario, "id");
  const pedirSonido = useSonidosCentral(ev, sv);
  const { movimientos, graves, avisos, marcarVisto } = useActividadCentral({
    eventos: ev, incidencias: inc, revisiones: rev, jornadas: jor, cierres: cie, servicios: sv, serviciosExtra, alertasHorario: alh,
    conductores, posiciones: ps, vehiculos, pedir: pedirSonido,
  });
  const [centrar, setCentrar] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const mapa = useRef<HTMLDivElement>(null);
  const alCentrar = useCallback((p: { lat: number; lng: number }) => {
    setCentrar((c) => ({ ...p, n: (c?.n ?? 0) + 1 }));
    mapa.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const tarjetasGraves = <><AlertasGraves graves={graves} alVisto={marcarVisto} alCentrar={alCentrar} /><AvisosAtencion avisos={avisos} alVisto={marcarVisto} alCentrar={alCentrar} /></>;
  const hayArriba = graves.length > 0 || avisos.length > 0;
  return (
    <div className="space-y-4">
      {!ok && <p role="status" className="text-xs text-amber-300">Reconectando…</p>}
      {/* En pantallas estrechas lo grave va arriba del todo (antes del mapa); en escritorio, arriba de la columna de alertas. */}
      {hayArriba && <div className="space-y-3 lg:hidden">{tarjetasGraves}</div>}
      <Contadores servicios={sv} conductores={conductores} posiciones={ps} umbralMin={umbralMin} />
      {/* Mapa grande (ocupa casi toda la altura) y alertas al lado con su propio scroll, sin salirse por la derecha. */}
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <div ref={mapa} className="min-w-0 lg:col-span-2 xl:col-span-3"><MapaFlota posiciones={ps} servicios={sv} conductores={conductores} vehiculos={vehiculos} umbralMin={umbralMin} eventos={ev} centrar={centrar} /></div>
        <div className="min-w-0 space-y-5 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1">
          <ColumnaAlertas servicios={sv} eventos={ev} conductores={conductores} vehiculos={vehiculos}
            arriba={hayArriba ? <div className="hidden space-y-3 lg:block">{tarjetasGraves}</div> : null} />
          <ActividadEnVivo movimientos={movimientos} />
        </div>
      </div>
    </div>
  );
}
