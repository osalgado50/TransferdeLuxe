import { z } from "zod";

export const TIPOS_VEHICULO = ["sedan", "minivan", "minivan_premium", "microbus", "minibus"] as const;

export type Favorito = {
  id: string; tipo: "direccion" | "trayecto"; nombre: string;
  origen_texto: string; origen_lat: number | null; origen_lng: number | null;
  destino_texto: string | null; destino_lat: number | null; destino_lng: number | null;
  pasajeros: number | null; maletas: number | null; tipo_vehiculo_pedido: (typeof TIPOS_VEHICULO)[number] | null;
};

/** Recorta y colapsa espacios del nombre. */
export const normalizarNombre = (s: string) => s.trim().replace(/\s+/g, " ");

export const esquemaNombre = z.string().transform(normalizarNombre)
  .pipe(z.string().min(1, "Escribe un nombre para el favorito").max(60, "El nombre admite hasta 60 caracteres"));

const coord = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(min).max(max).nullable());
const texto = z.string().trim().min(1, "Falta la dirección").max(300);

export const esquemaFavoritoDireccion = z.object({
  nombre: esquemaNombre, texto, lat: coord(-90, 90), lng: coord(-180, 180),
});

export const esquemaFavoritoTrayecto = z.object({
  nombre: esquemaNombre,
  origen_texto: texto, origen_lat: coord(-90, 90), origen_lng: coord(-180, 180),
  destino_texto: texto, destino_lat: coord(-90, 90), destino_lng: coord(-180, 180),
  pasajeros: z.coerce.number().int().min(1).max(19),
  maletas: z.coerce.number().int().min(0).max(30),
  tipo_vehiculo_pedido: z.enum(TIPOS_VEHICULO),
});

/** Un trayecto se puede guardar cuando origen y destino tienen texto. */
export const trayectoCompleto = (v: { origen_texto: string; destino_texto: string }) =>
  v.origen_texto.trim() !== "" && v.destino_texto.trim() !== "";

/** Lee texto y coordenadas de un campo de dirección desde los inputs del formulario (lo mismo que enviaría «Reservar»). */
export function leerDireccionForm(fd: FormData, name: string) {
  const g = (k: string) => String(fd.get(`${name}_${k}`) ?? "");
  return { texto: g("texto"), lat: g("lat"), lng: g("lng") };
}

export const tieneCoordenadas = (v: { lat: unknown; lng: unknown }) =>
  v.lat != null && v.lng != null && String(v.lat) !== "" && String(v.lng) !== "" && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng));

/** Favoritos de dirección que casan con lo escrito (primero los que empiezan por ello). */
export function filtrarDirecciones(favs: Favorito[], q: string, max = 5) {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const pts = (f: Favorito) => {
    const n = f.nombre.toLowerCase(), d = f.origen_texto.toLowerCase();
    return n.startsWith(t) || d.startsWith(t) ? 0 : n.includes(t) || d.includes(t) ? 1 : 2;
  };
  return favs.filter((f) => f.tipo === "direccion" && pts(f) < 2)
    .sort((a, b) => pts(a) - pts(b) || a.nombre.localeCompare(b.nombre)).slice(0, max);
}
