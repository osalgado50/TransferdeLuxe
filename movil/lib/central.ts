import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Movimiento } from "@dominio/actividad";
import type { Conexion } from "@dominio/conexionConductor";
import { crearFreno } from "@dominio/reintento";
import type { Sugerencia } from "@dominio/sugerencia";
import type { IndicadorPuntualidad } from "@dominio/puntualidadCentral";
import type { PosicionActual, Rol, Servicio } from "@dominio/tipos";
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { llamarApi } from "./api";
import { alRecuperar, caido } from "./red";
import { supabase } from "./supabase";
import { useCambiosTabla } from "./tiempoReal";

export type ServicioCentral = Pick<Servicio, "id" | "estado" | "conductor_id" | "vehiculo_id" | "fecha_hora_recogida" | "origen_texto"
  | "destino_texto" | "pasajeros" | "maletas" | "numero_vuelo" | "notas" | "cliente_nombre" | "cliente_telefono" | "origen_pedido"
  | "ultima_incidencia" | "incidencia_vista" | "subcontratar" | "asignado_en" | "plazo_respuesta_min">;
export interface ConductorCentral { id: string; nombre: string; telefono: string | null; rol: Rol; conduce: boolean | null; vehiculo_habitual_id: string | null }
export interface ResumenCentral {
  generadoEn: string; alertas: ServicioCentral[]; pendientes: ServicioCentral[]; hoy: ServicioCentral[];
  posiciones: (PosicionActual & { nombre?: string })[]; conductores: ConductorCentral[];
  /** Últimos movimientos (12 h) ya redactados y lo grave sin resolver (opcionales: servidores anteriores no los traen). */
  actividad?: Movimiento[]; graves?: Movimiento[];
  /** Semáforo de llegada a la recogida por id de servicio (opcional: servidores anteriores no lo traen). */
  puntualidad?: Record<string, IndicadorPuntualidad>;
}
export type SugerenciaCentral = Sugerencia & { vehiculoId: string | null; matricula: string | null; conexion?: Conexion };

async function json<T>(r: Response): Promise<T> {
  const d = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok) throw new Error(d?.error ?? `Error ${r.status}`);
  return d as T;
}

export const leerResumen = async () => json<ResumenCentral>(await llamarApi("/api/central/resumen"));
export const leerSugerencias = async (servicioId: string) =>
  (await json<{ sugerencias: SugerenciaCentral[] }>(await llamarApi(`/api/central/sugerencia?servicio=${encodeURIComponent(servicioId)}`))).sugerencias;

/** Asigna o reasigna. Devuelve null si fue bien o el mensaje de error (409 incluido). Nunca lanza. */
export async function asignarServicio(tipo: "asignar" | "reasignar", servicioId: string, conductorId: string, vehiculoId?: string | null): Promise<string | null> {
  try {
    const r = await llamarApi(`/api/central/${tipo}`, {
      method: "POST", body: { idAccion: nuevoId(), servicioId, conductorId, ...(vehiculoId ? { vehiculoId } : {}) },
    });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return r.ok && d?.ok !== false ? null : (d?.error ?? `No se pudo ${tipo} (error ${r.status})`);
  } catch {
    return "Sin conexión. Inténtalo de nuevo.";
  }
}

/** Deshace el último paso del conductor (salida, carga o descarga), sin límite de tiempo. null = bien; si no, el motivo. */
export async function deshacerPaso(servicioId: string): Promise<string | null> {
  try {
    const r = await llamarApi("/api/central/deshacer", { method: "POST", body: { idAccion: nuevoId(), servicioId } });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return r.ok && d?.ok !== false ? null : (d?.error ?? `No se pudo deshacer (error ${r.status})`);
  } catch {
    return "Sin conexión. Inténtalo de nuevo.";
  }
}

export async function marcarAlertaVista(servicioId: string): Promise<string | null> {
  try {
    const r = await llamarApi("/api/central/alerta-vista", { method: "POST", body: { servicioId } });
    return r.ok ? null : ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo marcar como vista";
  } catch {
    return "Sin conexión. Inténtalo de nuevo.";
  }
}

/** «Visto» de una hoja de cierre con daños (para toda la central). Devuelve null si fue bien o el mensaje de error. */
export async function marcarCierreVisto(cierreId: string): Promise<string | null> {
  try {
    const r = await llamarApi("/api/central/cierre-visto", { method: "POST", body: { cierreId } });
    return r.ok ? null : ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo marcar como vista";
  } catch {
    return "Sin conexión. Inténtalo de nuevo.";
  }
}

/** «Resuelta» de una incidencia (tarjeta roja de lo grave). Devuelve null si fue bien o el mensaje de error. */
export async function resolverIncidencia(incidenciaId: string): Promise<string | null> {
  try {
    const r = await llamarApi("/api/central/incidencia-resuelta", { method: "POST", body: { incidenciaId } });
    return r.ok ? null : ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo marcar como resuelta";
  } catch {
    return "Sin conexión. Inténtalo de nuevo.";
  }
}

function nuevoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (x) => {
    const r = (Math.random() * 16) | 0;
    return (x === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Umbral «sin señal» de los ajustes de la central (5 min si no se puede leer). */
async function leerUmbral(): Promise<number> {
  try {
    const { data } = await supabase.from("ajustes").select("umbral_sin_senal_min").limit(1).maybeSingle();
    return (data as { umbral_sin_senal_min?: number } | null)?.umbral_sin_senal_min ?? 5;
  } catch { return 5; }
}

const CADA_MS = 30_000;
const CLAVE_VISTOS = "tdl-graves-vistos";
/** Las posiciones llegan cada ~12 s por conductor: recargar el resumen en cada una saturaba el servidor. Como mucho 1 / 15 s. */
const FRENO_POSICIONES_MS = 15_000;

/** Resumen de la central: carga, Realtime (servicios y posiciones), cada 30 s en primer plano y al volver a la app. */
function useResumenCentral() {
  const [datos, setDatos] = useState<ResumenCentral | null>(null);
  const [umbral, setUmbral] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const enCurso = useRef(false);

  const recargar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    try { setDatos(await leerResumen()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Error al cargar"); }
    finally { enCurso.current = false; setCargando(false); }
  }, []);

  useEffect(() => { void recargar(); void leerUmbral().then(setUmbral); }, [recargar]);

  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programar = useCallback(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => void recargar(), 800);
  }, [recargar]);
  const freno = useRef(crearFreno(FRENO_POSICIONES_MS));
  const posicion = useCallback(() => freno.current.pedir(() => void recargar()), [recargar]);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); freno.current.cancelar(); }, []);
  useCambiosTabla("servicios", programar, programar);
  useCambiosTabla("posicion_actual", posicion, programar);
  // «Actividad en vivo»: eventos sin cambio de servicio (llegando…), incidencias, checklists y jornadas. Son pocos y
  // `programar` agrupa la ráfaga (servicio + evento de la misma acción) en UNA recarga.
  useCambiosTabla("eventos_servicio", programar, programar);
  useCambiosTabla("incidencias", programar, programar);
  useCambiosTabla("checklist_revisiones", programar, programar);
  useCambiosTabla("jornadas", programar, programar);
  useEffect(() => alRecuperar(() => programar()), [programar]);

  useEffect(() => {
    // Con el servidor caído no se insiste: la sonda de red avisa al volver (alRecuperar) y entonces se recarga.
    const periodico = () => { if (!caido("api")) void recargar(); };
    let intervalo: ReturnType<typeof setInterval> | null = setInterval(periodico, CADA_MS);
    const s = AppState.addEventListener("change", (e) => {
      if (e === "active") {
        void recargar();
        if (!intervalo) intervalo = setInterval(periodico, CADA_MS);
      } else if (intervalo) { clearInterval(intervalo); intervalo = null; }
    });
    return () => { s.remove(); if (intervalo) clearInterval(intervalo); };
  }, [recargar]);

  // Graves marcadas «Visto» en este móvil (dejan de insistir y salen de la tarjeta roja; siguen en la actividad).
  const [vistos, setVistos] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    void AsyncStorage.getItem(CLAVE_VISTOS).then((v) => { if (v) setVistos(new Set(JSON.parse(v) as string[])); }).catch(() => undefined);
  }, []);
  const marcarGraveVista = useCallback((id: string) => setVistos((prev) => {
    const n = new Set(prev).add(id);
    void AsyncStorage.setItem(CLAVE_VISTOS, JSON.stringify([...n].slice(-100))).catch(() => undefined);
    return n;
  }), []);

  return { datos, umbral, error, cargando, recargar, vistos, marcarGraveVista };
}

type Central = ReturnType<typeof useResumenCentral>;
const Contexto = createContext<Central | null>(null);

/** Una sola carga/suscripción compartida por todas las pestañas del modo central. */
export function ProveedorCentral({ children }: { children: ReactNode }) {
  return createElement(Contexto.Provider, { value: useResumenCentral() }, children);
}

export function useCentral(): Central {
  const c = useContext(Contexto);
  if (!c) throw new Error("useCentral fuera de ProveedorCentral");
  return c;
}
