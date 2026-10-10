import type { EstadoServicio, Servicio } from "@dominio/tipos";
import { supabase } from "./supabase";

export type ServicioLista = Pick<Servicio, "id" | "conductor_id" | "fecha_hora_recogida" | "origen_texto" | "destino_texto" | "pasajeros" | "maletas"> & { estado: EstadoServicio };
export const CAMPOS_LISTA = "id,estado,conductor_id,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas";

/** Lanza si Supabase devuelve error: las pantallas lo muestran y reintentan. */
export function exigir<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
