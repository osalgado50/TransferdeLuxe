import "server-only";
import { estadisticas, rangoPorDefecto, type RangoPrecio } from "./plausibles";

/**
 * Precios del día de los carburantes (Geoportal de Gasolineras del Ministerio: servicio público, gratuito y sin clave)
 * en la provincia de la empresa. Sirve para colocar la coma del €/L que lee el OCR y avisar si un precio es raro.
 * Caché de 6 h; si el servicio no responde, rango orientativo (nunca bloquea la lectura del ticket).
 */
const PROVINCIA = "43"; // Tarragona (Costa Daurada)
const NOMBRE_PROVINCIA = "Tarragona";
const URL = `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/${PROVINCIA}`;
const CACHE_MS = 6 * 3600_000, REINTENTO_MS = 10 * 60_000;
const CAMPOS: Record<string, string[]> = {
  "Diésel": ["Precio Gasoleo A"],
  "Gasolina 95": ["Precio Gasolina 95 E5", "Precio Gasolina 95 E10"],
  "Gasolina 98": ["Precio Gasolina 98 E5", "Precio Gasolina 98 E10"],
};
type Estacion = Record<string, string>;
let cache: { hasta: number; estaciones: Estacion[] | null } | null = null;

async function estaciones(): Promise<Estacion[] | null> {
  if (cache && cache.hasta > Date.now()) return cache.estaciones;
  try {
    const r = await fetch(URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { ListaEESSPrecio?: Estacion[] };
    const lista = j.ListaEESSPrecio ?? [];
    cache = { hasta: Date.now() + CACHE_MS, estaciones: lista.length ? lista : null };
  } catch (e) {
    console.error("[precios carburante]", e instanceof Error ? e.message : e);
    cache = { hasta: Date.now() + REINTENTO_MS, estaciones: null };
  }
  return cache.estaciones;
}

/** Rango de precios de hoy del combustible en la provincia (o el orientativo si no hay datos). */
export async function rangoDelDia(tipo: string | null): Promise<RangoPrecio> {
  const campos = tipo ? CAMPOS[tipo] : [...CAMPOS["Diésel"], ...CAMPOS["Gasolina 95"]];
  if (!campos) return rangoPorDefecto(tipo);
  const lista = await estaciones();
  if (!lista) return rangoPorDefecto(tipo);
  const precios = lista.flatMap((e) => campos.map((c) => Number((e[c] ?? "").replace(",", ".")))).filter((n) => n > 0);
  return estadisticas(precios, `precios de hoy en ${NOMBRE_PROVINCIA}, Ministerio`) ?? rangoPorDefecto(tipo);
}
