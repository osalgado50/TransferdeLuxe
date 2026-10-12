// Incidencias que el conductor comunica a la central. Lógica pura (sin dependencias: la importa también la app nativa).
import { IDS_ZONAS, normalizarZonas } from "./cierre";

export const TIPOS_INCIDENCIA = [
  { clave: "averia", nombre: "Avería", boton: "Avería" },
  { clave: "accidente", nombre: "Accidente", boton: "Accidente" },
  { clave: "golpe", nombre: "Golpe", boton: "Golpe / daño en el vehículo" },
  { clave: "no_presentado", nombre: "Cliente no presentado", boton: "Cliente no presentado" },
  { clave: "retraso", nombre: "Retraso", boton: "Retraso" },
  { clave: "otro", nombre: "Otro", boton: "Otro" },
] as const;
export type TipoIncidencia = (typeof TIPOS_INCIDENCIA)[number]["clave"];

/** Graves: van a la central con ALARMA (tarjeta roja fija, sirena y push con sonido de alarma). */
export const TIPOS_GRAVES = ["averia", "accidente", "golpe"] as const;
export const esIncidenciaGrave = (tipo: string) => (TIPOS_GRAVES as readonly string[]).includes(tipo);

/** Tipos con parte de golpes: se marcan las zonas dañadas en el diagrama del coche. */
export const TIPOS_CON_ZONAS = ["accidente", "golpe"] as const;
export const admiteZonas = (tipo: string) => (TIPOS_CON_ZONAS as readonly string[]).includes(tipo);

export interface Incidencia {
  id: string; conductor_id: string; servicio_id: string | null; tipo: TipoIncidencia; descripcion: string;
  foto_path: string | null; lat: number | null; lng: number | null; creado_en: string; resuelta: boolean; zonas?: string[];
}

export const nombreTipoIncidencia = (t: string) => TIPOS_INCIDENCIA.find((x) => x.clave === t)?.nombre ?? "Incidencia";

export interface DatosIncidencia {
  tipo: TipoIncidencia; descripcion: string; servicio_id: string | null; foto_path: string | null; lat: number | null; lng: number | null;
  zonas: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONAS_VALIDAS = new Set<string>(IDS_ZONAS);

/** Zonas de una incidencia: lista de ids del diagrama (sin repetir, en orden). Solo accidente y golpe las llevan. */
export function validarZonasIncidencia(tipo: string, x: unknown): { ok: true; zonas: string[] } | { ok: false; error: string } {
  if (x === undefined || x === null) return { ok: true, zonas: [] };
  if (!Array.isArray(x) || x.length > IDS_ZONAS.length * 2 || x.some((z) => typeof z !== "string" || !ZONAS_VALIDAS.has(z))) {
    return { ok: false, error: "Zona del vehículo no válida." };
  }
  return { ok: true, zonas: admiteZonas(tipo) ? normalizarZonas(x as string[]) : [] };
}

/** Valida la entrada (web o app). `conductorId` restringe la foto a su carpeta del bucket. */
export function validarIncidencia(x: unknown, conductorId: string): { ok: true; datos: DatosIncidencia } | { ok: false; error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const tipo = TIPOS_INCIDENCIA.find((t) => t.clave === o.tipo)?.clave;
  if (!tipo) return { ok: false, error: "Elige el tipo de incidencia." };
  const descripcion = typeof o.descripcion === "string" ? o.descripcion.trim() : "";
  if (descripcion.length > 1000) return { ok: false, error: "La descripción es demasiado larga." };
  const z = validarZonasIncidencia(tipo, o.zonas);
  if (!z.ok) return z;
  if ((tipo === "otro" || tipo === "accidente") && !descripcion) return { ok: false, error: "Describe brevemente lo ocurrido." };
  if (tipo === "golpe" && !descripcion && !z.zonas.length) return { ok: false, error: "Marca en el dibujo dónde está el golpe o descríbelo." };
  const sid = typeof o.servicio_id === "string" && o.servicio_id ? o.servicio_id : null;
  if (sid && !UUID.test(sid)) return { ok: false, error: "Servicio no válido." };
  const foto = typeof o.foto_path === "string" && o.foto_path ? o.foto_path : null;
  if (foto && !new RegExp(`^${conductorId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i").test(foto)) return { ok: false, error: "Foto no válida." };
  const coord = (v: unknown, lim: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null);
  let lat = coord(o.lat, 90), lng = coord(o.lng, 180);
  if (lat === null || lng === null) lat = lng = null;
  return { ok: true, datos: { tipo, descripcion, servicio_id: sid, foto_path: foto, lat, lng, zonas: z.zonas } };
}

/** Incidencia del día tal como la lee la hoja de cierre. */
export interface IncidenciaDia { tipo: string; zonas?: string[] | null; creado_en: string }

/**
 * Lo acumulado del día para la hoja de cierre: zonas ya comunicadas en accidentes/golpes (se precargan marcadas) y un
 * resumen «Golpe 10:42 (Puerta del. izq.) · Avería 12:05».
 */
export function acumuladoDelDia(incidencias: readonly IncidenciaDia[], hora: (iso: string) => string): { zonas: string[]; resumen: string[] } {
  const orden = [...incidencias].sort((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en));
  const zonas = normalizarZonas(orden.flatMap((i) => (admiteZonas(i.tipo) ? (i.zonas ?? []) : [])));
  const resumen = orden.map((i) => {
    const z = admiteZonas(i.tipo) ? normalizarZonas(i.zonas ?? []) : [];
    return `${nombreTipoIncidencia(i.tipo)} ${hora(i.creado_en)}${z.length ? ` (${z.length} zona${z.length > 1 ? "s" : ""})` : ""}`;
  });
  return { zonas, resumen };
}
