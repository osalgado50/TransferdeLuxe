"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  construirActividad, esIncidenciaGrave, pasoAlarma, HORAS_ACTIVIDAD,
  type AlertaHorarioAct, type CierreAct, type EstadoAlarma, type EventoAct, type IncidenciaAct, type JornadaAct, type RevisionAct, type ServicioAct,
} from "@/lib/dominio/actividad";
import type { Sonido } from "@/lib/dominio/sonidos";

const CLAVE_VISTOS = "tdl-graves-vistos";
function leerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? "[]") as string[]); } catch { return new Set(); }
}
function guardarVistos(s: Set<string>) {
  try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...s].slice(-100))); } catch { /* sin almacenamiento: vale para esta pestaña */ }
}
const RECIENTE_MS = 2 * 60_000;

/**
 * «Actividad en vivo» del panel: construye el feed con los datos en vivo (Realtime) y gestiona los sonidos de lo
 * que no es un evento de servicio: tres pitidos para un aviso nuevo (retraso, no presentado, checklist con fallos)
 * y la ALARMA para las graves (avería/accidente) sin ver: al aparecer y cada 30 s, máx. 5, hasta pulsar «Visto».
 * «Visto» es por navegador (localStorage); «Marcar resuelta» las quita para todos.
 */
export function useActividadCentral(o: {
  eventos: EventoAct[]; incidencias: IncidenciaAct[]; revisiones: RevisionAct[]; jornadas: JornadaAct[]; cierres: CierreAct[];
  servicios: ServicioAct[]; serviciosExtra: ServicioAct[]; alertasHorario?: AlertaHorarioAct[];
  conductores: { id: string; nombre: string; telefono?: string | null }[];
  posiciones: { conductor_id: string; lat: number; lng: number }[]; vehiculos: { id: string; matricula: string }[];
  pedir: (s: Sonido) => void;
}) {
  const { eventos, incidencias, revisiones, jornadas, cierres, servicios, serviciosExtra, conductores, posiciones, vehiculos, pedir, alertasHorario } = o;
  const [ahora, setAhora] = useState(() => Date.now());
  // GPS: cada posición nueva repinta solo el mapa; la actividad (zona de retrasos, incidencias y alertas) usa una foto
  // de las posiciones que se renueva cada minuto, a la vez que el reloj (un solo render).
  const ultimasPos = useRef(posiciones);
  useEffect(() => { ultimasPos.current = posiciones; }, [posiciones]);
  const [fotoPos, setFotoPos] = useState(posiciones);
  useEffect(() => {
    const t = setInterval(() => { setAhora(Date.now()); setFotoPos(ultimasPos.current); }, 60_000);
    return () => clearInterval(t);
  }, []);

  const { movimientos, graves, avisos } = useMemo(() => construirActividad({
    eventos, incidencias, revisiones, jornadas, cierres, conductores, posiciones: fotoPos, vehiculos, alertasHorario,
    servicios: [...serviciosExtra, ...servicios], // los del panel (en vivo) pisan a los extra
    desde: new Date(ahora - HORAS_ACTIVIDAD * 3600e3),
  }), [eventos, incidencias, revisiones, jornadas, cierres, servicios, serviciosExtra, conductores, fotoPos, vehiculos, alertasHorario, ahora]);

  // null hasta leer el navegador (evita que la alarma suene por graves ya vistas antes de cargarlas).
  const [vistos, setVistos] = useState<Set<string> | null>(null);
  useEffect(() => { setVistos(leerVistos()); }, []);
  const marcarVisto = useCallback((id: string) => setVistos((prev) => {
    const n = new Set(prev ?? []).add(id);
    guardarVistos(n);
    return n;
  }), []);
  const sinVer = useMemo(() => graves.filter((g) => !vistos?.has(g.id)), [graves, vistos]);
  const avisosSinVer = useMemo(() => avisos.filter((g) => !vistos?.has(g.id)), [avisos, vistos]);

  // Avisos nuevos (llegados por Realtime) → tres pitidos. Las graves suenan con la alarma de abajo.
  const conocidos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const vistosAntes = conocidos.current;
    const ahoraMs = Date.now();
    const claves = [...incidencias.map((i) => `inc-${i.id}`), ...revisiones.map((r) => `rev-${r.id}`), ...cierres.map((c) => `cie-${c.id}`),
      ...jornadas.filter((j) => j.pendientes_cierre?.length).map((j) => `jorp-${j.id}`), ...(alertasHorario ?? []).map((a) => `ah-${a.id}`)];
    if (!vistosAntes) { conocidos.current = new Set(claves); return; }
    const reciente = (iso: string) => ahoraMs - Date.parse(iso) <= RECIENTE_MS;
    let aviso = false;
    for (const i of incidencias) {
      if (vistosAntes.has(`inc-${i.id}`)) continue;
      vistosAntes.add(`inc-${i.id}`);
      if (!esIncidenciaGrave(i.tipo) && !i.resuelta && reciente(i.creado_en)) aviso = true;
    }
    for (const r of revisiones) {
      if (vistosAntes.has(`rev-${r.id}`)) continue;
      vistosAntes.add(`rev-${r.id}`);
      if (r.con_fallos && reciente(r.creado_en)) aviso = true;
    }
    // Hoja de cierre: mantenimiento → tres pitidos; todo en verde → arpegio de cierre (lo grave, con la alarma).
    let verde = false;
    for (const c of cierres) {
      if (vistosAntes.has(`cie-${c.id}`)) continue;
      vistosAntes.add(`cie-${c.id}`);
      if (!reciente(c.creado_en)) continue;
      if (c.gravedad === "mantenimiento") aviso = true;
      else if (c.gravedad === "ok") verde = true;
    }
    // Jornada cerrada con servicios pendientes hoy (lo marca el vigilante al revisar la jornada): tres pitidos.
    for (const j of jornadas) {
      if (!j.pendientes_cierre?.length || vistosAntes.has(`jorp-${j.id}`)) continue;
      vistosAntes.add(`jorp-${j.id}`);
      if (j.fin && ahoraMs - Date.parse(j.fin) <= 90 * 60_000) aviso = true;
    }
    // Alertas de horario (fuera de horario, sin iniciar jornada, fin de turno): tres pitidos.
    for (const a of alertasHorario ?? []) {
      if (vistosAntes.has(`ah-${a.id}`)) continue;
      vistosAntes.add(`ah-${a.id}`);
      if (reciente(a.creado_en)) aviso = true;
    }
    if (aviso) pedir("incidencia");
    else if (verde) pedir("completado");
  }, [incidencias, revisiones, cierres, jornadas, alertasHorario, pedir]);

  // Alarma insistente para las graves sin ver.
  const alarma = useRef<EstadoAlarma | null>(null);
  const clave = vistos ? sinVer.map((g) => g.id).join("|") : null;
  useEffect(() => {
    if (clave === null) return;
    const ids = clave ? clave.split("|") : [];
    const tick = () => {
      const r = pasoAlarma(alarma.current, ids, Date.now());
      alarma.current = r.estado;
      if (r.sonar) pedir("alarma");
    };
    tick();
    if (!ids.length) return;
    const t = setInterval(tick, 5_000);
    return () => clearInterval(t);
  }, [clave, pedir]);

  return { movimientos, graves: sinVer, avisos: avisosSinVer, marcarVisto };
}
