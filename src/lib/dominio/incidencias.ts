// Incidencias que el conductor comunica a la central. Lógica pura.
export const TIPOS_INCIDENCIA = [
  { clave: "averia", nombre: "Avería" },
  { clave: "accidente", nombre: "Accidente" },
  { clave: "no_presentado", nombre: "Cliente no presentado" },
  { clave: "retraso", nombre: "Retraso" },
  { clave: "otro", nombre: "Otro" },
] as const;
export type TipoIncidencia = (typeof TIPOS_INCIDENCIA)[number]["clave"];

export interface Incidencia {
  id: string; conductor_id: string; servicio_id: string | null; tipo: TipoIncidencia; descripcion: string;
  foto_path: string | null; lat: number | null; lng: number | null; creado_en: string; resuelta: boolean;
}

export const nombreTipoIncidencia = (t: string) => TIPOS_INCIDENCIA.find((x) => x.clave === t)?.nombre ?? "Incidencia";

export interface DatosIncidencia {
  tipo: TipoIncidencia; descripcion: string; servicio_id: string | null; foto_path: string | null; lat: number | null; lng: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida la entrada (web o app). `conductorId` restringe la foto a su carpeta del bucket. */
export function validarIncidencia(x: unknown, conductorId: string): { ok: true; datos: DatosIncidencia } | { ok: false; error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const tipo = TIPOS_INCIDENCIA.find((t) => t.clave === o.tipo)?.clave;
  if (!tipo) return { ok: false, error: "Elige el tipo de incidencia." };
  const descripcion = typeof o.descripcion === "string" ? o.descripcion.trim() : "";
  if (descripcion.length > 1000) return { ok: false, error: "La descripción es demasiado larga." };
  if ((tipo === "otro" || tipo === "accidente") && !descripcion) return { ok: false, error: "Describe brevemente lo ocurrido." };
  const sid = typeof o.servicio_id === "string" && o.servicio_id ? o.servicio_id : null;
  if (sid && !UUID.test(sid)) return { ok: false, error: "Servicio no válido." };
  const foto = typeof o.foto_path === "string" && o.foto_path ? o.foto_path : null;
  if (foto && !new RegExp(`^${conductorId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i").test(foto)) return { ok: false, error: "Foto no válida." };
  const coord = (v: unknown, lim: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null);
  let lat = coord(o.lat, 90), lng = coord(o.lng, 180);
  if (lat === null || lng === null) lat = lng = null;
  return { ok: true, datos: { tipo, descripcion, servicio_id: sid, foto_path: foto, lat, lng } };
}
