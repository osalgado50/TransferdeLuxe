// Google Places API (New): Autocomplete + Place Details. PREPARADO PERO APAGADO: solo se usa si hay
// GOOGLE_PLACES_API_KEY en el entorno (es de pago por uso). Sin clave no se crea el proveedor.
import type { LugarSugerido } from "@/lib/dominio/geocodificacion";

const BASE = "https://places.googleapis.com/v1";
// Sesgo a la Costa Dorada (el radio máximo que admite Google es 50 km).
const SESGO = { circle: { center: { latitude: 41.08, longitude: 1.14 }, radius: 50000 } };

/** Identificador de lugar de Google: letras, números, guion y guion bajo. */
export const placeIdValido = (id: string) => /^[A-Za-z0-9_-]{10,300}$/.test(id);

export function parsearAutocompletado(json: unknown): LugarSugerido[] | null {
  const s = (json as { suggestions?: unknown })?.suggestions;
  if (s === undefined && json && typeof json === "object") return []; // Google omite el campo cuando no hay resultados
  if (!Array.isArray(s)) return null;
  const lugares: LugarSugerido[] = [];
  for (const x of s as { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[]) {
    const p = x?.placePrediction;
    if (!p?.placeId || !placeIdValido(p.placeId)) continue;
    const principal = p.structuredFormat?.mainText?.text, secundario = p.structuredFormat?.secondaryText?.text;
    const etiqueta = principal ? [principal, secundario].filter(Boolean).join(" · ") : p.text?.text;
    if (!etiqueta) continue;
    lugares.push({ etiqueta, lat: null, lng: null, frecuente: false, fuente: "google", placeId: p.placeId });
  }
  return lugares;
}

export function parsearDetalle(json: unknown): { etiqueta: string; lat: number; lng: number } | null {
  const d = json as { location?: { latitude?: unknown; longitude?: unknown }; displayName?: { text?: string }; formattedAddress?: string } | null;
  const lat = Number(d?.location?.latitude), lng = Number(d?.location?.longitude);
  if (!d?.location || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const nombre = d.displayName?.text?.trim(), dir = d.formattedAddress?.trim();
  const etiqueta = nombre && dir && !dir.startsWith(nombre) ? `${nombre} · ${dir}` : (dir ?? nombre ?? "");
  return etiqueta ? { etiqueta, lat, lng } : null;
}

export function crearGooglePlaces(clave: string, f: typeof fetch = fetch) {
  const cabeceras = { "X-Goog-Api-Key": clave, "Content-Type": "application/json" };
  return {
    async autocompletar(q: string): Promise<LugarSugerido[] | null> {
      try {
        const r = await f(`${BASE}/places:autocomplete`, {
          method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
          headers: { ...cabeceras, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" },
          body: JSON.stringify({ input: q, languageCode: "es", regionCode: "es", includedRegionCodes: ["es", "ad"], locationBias: SESGO }),
        });
        return r.ok ? parsearAutocompletado(await r.json()) : null;
      } catch { return null; }
    },
    async detalle(placeId: string): Promise<{ etiqueta: string; lat: number; lng: number } | null> {
      if (!placeIdValido(placeId)) return null;
      try {
        const r = await f(`${BASE}/places/${placeId}?languageCode=es`, {
          cache: "no-store", signal: AbortSignal.timeout(5000),
          headers: { ...cabeceras, "X-Goog-FieldMask": "displayName,formattedAddress,location" },
        });
        return r.ok ? parsearDetalle(await r.json()) : null;
      } catch { return null; }
    },
  };
}

/** Proveedor de Google solo si hay clave; si no, null (no se usa ni aparece). */
export function googleDesdeEntorno(f: typeof fetch = fetch) {
  const clave = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return clave ? crearGooglePlaces(clave, f) : null;
}
