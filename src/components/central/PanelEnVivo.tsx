"use client";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTiempoReal } from "@/lib/supabase/useTiempoReal";
import { acotarFilas, esServicioDePrueba, PREFIJO_PRUEBA_AUTOMATICA } from "@/lib/dominio/filasEnVivo";
import { esIncidenciaGrave } from "@/lib/dominio/incidencias";
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
const SIN_OCULTOS: string[] = [];
// Lo que no depende del GPS no se repinta con cada posición nueva (solo el mapa y los contadores).
const ColumnaAlertasM = memo(ColumnaAlertas);
const ActividadEnVivoM = memo(ActividadEnVivo);
const AlertasGravesM = memo(AlertasGraves);
const AvisosAtencionM = memo(AvisosAtencion);

// Listas que crecen con el panel abierto días: más de 500 filas → fuera lo de hace más de 24 h (salvo lo pendiente).
const MAX_FILAS = 500, HORAS_FILAS = 24;
const acotar = <T,>(fecha: (f: T) => string, conservar?: (f: T) => boolean) => (filas: T[]) =>
  acotarFilas(filas, { fecha, max: MAX_FILAS, horas: HORAS_FILAS, ahora: Date.now(), conservar });
const acotarEventos = acotar<EventoAlerta>((e) => e.creado_en, (e) => e.tipo === "rechazado" || e.tipo === "devuelto");
const acotarIncidencias = acotar<IncidenciaAct>((i) => i.creado_en, (i) => !i.resuelta && esIncidenciaGrave(i.tipo));
const acotarAlertas = acotar<AlertaHorarioAct>((a) => a.creado_en, (a) => !a.resuelta_en);
const acotarRevisiones = acotar<RevisionAct>((r) => r.creado_en);

export default function PanelEnVivo({ servicios, posiciones, eventos, conductores, vehiculos, umbralMin, incidencias, revisiones, jornadas, cierres, serviciosExtra, alertasHorario = SIN_ALERTAS, ocultos = SIN_OCULTOS, atrasados }: {
  servicios: Servicio[]; posiciones: PosicionActual[]; eventos: EventoAlerta[];
  conductores: (Pick<Perfil, "id" | "nombre" | "vehiculo_habitual_id"> & { telefono?: string | null })[]; vehiculos: Pick<Vehiculo, "id" | "matricula">[]; umbralMin: number;
  incidencias: IncidenciaAct[]; revisiones: RevisionAct[]; jornadas: JornadaAct[]; cierres: CierreAct[]; serviciosExtra: ServicioAct[];
  alertasHorario?: AlertaHorarioAct[];
  /** Servicios de pruebas automáticas ya conocidos al cargar: sus eventos, incidencias y alertas no entran. */
  ocultos?: string[];
  /** Servicios de días anteriores sin terminar (contador «Atrasados»). */
  atrasados?: Servicio[];
}) {
  const [ok, setOk] = useState(true);
  // Pruebas automáticas (es_prueba o notas «PRUEBA AUTOMÁTICA…»): fuera del panel también lo que llega por Realtime.
  // Los servicios de prueba que llegan se apuntan para descartar después sus eventos, incidencias y alertas.
  const dePrueba = useRef(new Set(ocultos));
  const opServicios = useMemo(() => ({ acepta: (s: Servicio) => {
    if (!esServicioDePrueba(s as Servicio & { es_prueba?: boolean | null })) return true;
    dePrueba.current.add(s.id);
    return false;
  } }), []);
  const opEventos = useMemo(() => ({ acepta: (e: EventoAlerta) => !dePrueba.current.has(e.servicio_id), acotar: acotarEventos }), []);
  const opIncidencias = useMemo(() => ({
    acepta: (i: IncidenciaAct) => (!i.servicio_id || !dePrueba.current.has(i.servicio_id)) && !i.descripcion?.startsWith(PREFIJO_PRUEBA_AUTOMATICA),
    acotar: acotarIncidencias,
  }), []);
  const opAlertas = useMemo(() => ({ acepta: (a: AlertaHorarioAct) => !a.servicio_id || !dePrueba.current.has(a.servicio_id), acotar: acotarAlertas }), []);
  const opRevisiones = useMemo(() => ({ acotar: acotarRevisiones }), []);
  const sv = useTiempoReal<Servicio>("servicios", servicios, "id", setOk, opServicios);
  const ps = useTiempoReal<PosicionActual>("posicion_actual", posiciones, "conductor_id");
  const ev = useTiempoReal<EventoAlerta>("eventos_servicio", eventos, "id", undefined, opEventos);
  const inc = useTiempoReal<IncidenciaAct>("incidencias", incidencias, "id", undefined, opIncidencias);
  const rev = useTiempoReal<RevisionAct>("checklist_revisiones", revisiones, "id", undefined, opRevisiones);
  const jor = useTiempoReal<JornadaAct>("jornadas", jornadas, "id");
  const cie = useTiempoReal<CierreAct>("cierres_jornada", cierres, "id");
  const alh = useTiempoReal<AlertaHorarioAct>("alertas_horario", alertasHorario, "id", undefined, opAlertas);
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
  const hayArriba = graves.length > 0 || avisos.length > 0;
  const tarjetasGraves = useMemo(() => <><AlertasGravesM graves={graves} alVisto={marcarVisto} alCentrar={alCentrar} /><AvisosAtencionM avisos={avisos} alVisto={marcarVisto} alCentrar={alCentrar} /></>,
    [graves, avisos, marcarVisto, alCentrar]);
  const arriba = useMemo(() => (hayArriba ? <div className="hidden space-y-3 lg:block">{tarjetasGraves}</div> : null), [hayArriba, tarjetasGraves]);
  return (
    <div className="space-y-4">
      {!ok && <p role="status" className="text-xs text-amber-300">Reconectando…</p>}
      {/* En pantallas estrechas lo grave va arriba del todo (antes del mapa); en escritorio, arriba de la columna de alertas. */}
      {hayArriba && <div className="space-y-3 lg:hidden">{tarjetasGraves}</div>}
      <Contadores servicios={sv} conductores={conductores} posiciones={ps} umbralMin={umbralMin} atrasados={atrasados} />
      {/* Mapa grande (ocupa casi toda la altura) y alertas al lado con su propio scroll, sin salirse por la derecha. */}
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <div ref={mapa} className="min-w-0 lg:col-span-2 xl:col-span-3"><MapaFlota posiciones={ps} servicios={sv} conductores={conductores} vehiculos={vehiculos} umbralMin={umbralMin} eventos={ev} centrar={centrar} /></div>
        <div className="min-w-0 space-y-5 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1">
          <ColumnaAlertasM servicios={sv} eventos={ev} conductores={conductores} vehiculos={vehiculos} arriba={arriba} />
          <ActividadEnVivoM movimientos={movimientos} />
        </div>
      </div>
    </div>
  );
}
