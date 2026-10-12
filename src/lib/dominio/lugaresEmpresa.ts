import { z } from "zod";
import { normalizarBusqueda, puntuarCoincidencia, textoConNombre, type LugarSugerido } from "./geocodificacion";

/** Cliente o sitio habitual de la empresa (privado: solo la central y los conductores). */
export type LugarEmpresa = {
  id: string; nombre: string; direccion: string; lat: number | null; lng: number | null;
  notas: string | null; telefono: string | null;
};

const coord = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(min).max(max).nullable());
const opcional = (max: number, msg: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v ?? null), z.string().trim().max(max, msg).nullable());

export const esquemaLugarEmpresa = z.object({
  nombre: z.string().transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Escribe el nombre del lugar").max(80, "El nombre admite hasta 80 caracteres")),
  direccion: z.string().trim().min(1, "Falta la dirección").max(300, "La dirección admite hasta 300 caracteres"),
  lat: coord(-90, 90), lng: coord(-180, 180),
  notas: opcional(500, "Las notas admiten hasta 500 caracteres"),
  telefono: opcional(30, "El teléfono admite hasta 30 caracteres")
    .refine((t) => t == null || /^[+\d][\d\s().-]*$/.test(t), "Teléfono no válido"),
}).refine((v) => (v.lat == null) === (v.lng == null), { message: "Coordenadas incompletas", path: ["lat"] });

/** Lugares de la empresa que casan con lo escrito (por nombre o dirección, sin acentos ni mayúsculas). */
export function filtrarLugaresEmpresa(lugares: LugarEmpresa[], q: string, max = 5): LugarEmpresa[] {
  if (normalizarBusqueda(q).length < 2) return [];
  const pts = (l: LugarEmpresa) => Math.min(puntuarCoincidencia(l.nombre, q), puntuarCoincidencia(l.direccion, q) + 1);
  return lugares.filter((l) => pts(l) < 2)
    .sort((a, b) => pts(a) - pts(b) || a.nombre.localeCompare(b.nombre, "es")).slice(0, max);
}

/** Sugerencia 🏢 para el autocompletado: el texto lleva el nombre delante para que el conductor sepa dónde va. */
export const sugerenciaEmpresa = (l: LugarEmpresa): LugarSugerido => ({
  etiqueta: textoConNombre(l.nombre, l.direccion), lat: l.lat, lng: l.lng, frecuente: true, fuente: "empresa", nombre: l.nombre,
});
