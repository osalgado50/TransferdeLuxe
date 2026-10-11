import { distanciaKm } from "./geo";

/**
 * Zona con nombre a partir de coordenadas, SIN APIs: localidades y puntos frecuentes de la zona de trabajo
 * (Camp de Tarragona, Costa Daurada, Terres de l'Ebre, Penedès, Barcelona y Lleida) con su centro aproximado.
 * `el`: se nombra con artículo («en el Aeropuerto de Reus», «cerca del…»).
 */
export interface Zona { nombre: string; lat: number; lng: number; el?: boolean }

export const ZONAS: readonly Zona[] = [
  // Costa Daurada y Camp de Tarragona
  { nombre: "Salou", lat: 41.0764, lng: 1.1416 },
  { nombre: "Cambrils", lat: 41.067, lng: 1.0597 },
  { nombre: "La Pineda", lat: 41.0753, lng: 1.182 },
  { nombre: "Vila-seca", lat: 41.1106, lng: 1.145 },
  { nombre: "PortAventura", lat: 41.0878, lng: 1.1572 },
  { nombre: "Reus", lat: 41.1561, lng: 1.1069 },
  { nombre: "Aeropuerto de Reus", lat: 41.1474, lng: 1.1672, el: true },
  { nombre: "Tarragona", lat: 41.1189, lng: 1.2445 },
  { nombre: "Estación Camp de Tarragona", lat: 41.1906, lng: 1.2725, el: true },
  { nombre: "La Canonja", lat: 41.1194, lng: 1.1764 },
  { nombre: "Constantí", lat: 41.1544, lng: 1.2142 },
  { nombre: "El Morell", lat: 41.193, lng: 1.21 },
  { nombre: "La Selva del Camp", lat: 41.2147, lng: 1.1428 },
  { nombre: "Castellvell del Camp", lat: 41.18, lng: 1.092 },
  { nombre: "Riudoms", lat: 41.1394, lng: 1.0503 },
  { nombre: "Montbrió del Camp", lat: 41.12, lng: 1.004 },
  { nombre: "Mont-roig del Camp", lat: 41.087, lng: 0.9586 },
  { nombre: "Miami Platja", lat: 40.998, lng: 0.975 },
  { nombre: "L'Hospitalet de l'Infant", lat: 40.993, lng: 0.923 },
  { nombre: "Vandellòs", lat: 41.019, lng: 0.832 },
  { nombre: "Alforja", lat: 41.2112, lng: 0.9747 },
  { nombre: "Alcover", lat: 41.2628, lng: 1.1703 },
  { nombre: "Valls", lat: 41.2861, lng: 1.2497 },
  { nombre: "Montblanc", lat: 41.3756, lng: 1.1631 },
  { nombre: "L'Espluga de Francolí", lat: 41.3964, lng: 1.1006 },
  { nombre: "Prades", lat: 41.31, lng: 0.988 },
  { nombre: "Cornudella de Montsant", lat: 41.264, lng: 0.906 },
  { nombre: "Falset", lat: 41.1453, lng: 0.8197 },
  { nombre: "El Catllar", lat: 41.176, lng: 1.324 },
  { nombre: "Altafulla", lat: 41.1417, lng: 1.3778 },
  { nombre: "Torredembarra", lat: 41.1453, lng: 1.3976 },
  { nombre: "Creixell", lat: 41.166, lng: 1.431 },
  { nombre: "Roda de Berà", lat: 41.1866, lng: 1.46 },
  { nombre: "Coma-ruga", lat: 41.182, lng: 1.523 },
  { nombre: "El Vendrell", lat: 41.2186, lng: 1.535 },
  { nombre: "Calafell", lat: 41.1997, lng: 1.5682 },
  { nombre: "Cunit", lat: 41.1975, lng: 1.6347 },
  // Terres de l'Ebre
  { nombre: "L'Ametlla de Mar", lat: 40.884, lng: 0.802 },
  { nombre: "El Perelló", lat: 40.875, lng: 0.713 },
  { nombre: "L'Ampolla", lat: 40.811, lng: 0.71 },
  { nombre: "Deltebre", lat: 40.72, lng: 0.717 },
  { nombre: "Tortosa", lat: 40.8125, lng: 0.5216 },
  { nombre: "Amposta", lat: 40.713, lng: 0.58 },
  { nombre: "Sant Carles de la Ràpita", lat: 40.618, lng: 0.593 },
  { nombre: "Alcanar", lat: 40.544, lng: 0.48 },
  { nombre: "Ulldecona", lat: 40.597, lng: 0.447 },
  { nombre: "Móra d'Ebre", lat: 41.092, lng: 0.643 },
  { nombre: "Ascó", lat: 41.184, lng: 0.568 },
  { nombre: "Flix", lat: 41.231, lng: 0.55 },
  { nombre: "Gandesa", lat: 41.053, lng: 0.437 },
  // Penedès, Garraf y Barcelona
  { nombre: "Cubelles", lat: 41.2081, lng: 1.6739 },
  { nombre: "Vilanova i la Geltrú", lat: 41.2242, lng: 1.7253 },
  { nombre: "Sitges", lat: 41.235, lng: 1.811 },
  { nombre: "Vilafranca del Penedès", lat: 41.3466, lng: 1.6982 },
  { nombre: "Castelldefels", lat: 41.28, lng: 1.9767 },
  { nombre: "Aeropuerto de Barcelona", lat: 41.2974, lng: 2.0833, el: true },
  { nombre: "Barcelona", lat: 41.3874, lng: 2.1686 },
  // Lleida
  { nombre: "Lleida", lat: 41.6176, lng: 0.62 },
  { nombre: "Les Borges Blanques", lat: 41.522, lng: 0.869 },
  { nombre: "Mollerussa", lat: 41.631, lng: 0.895 },
  { nombre: "Tàrrega", lat: 41.647, lng: 1.14 },
];

export const EN_KM = 3, CERCA_KM = 15;

export interface ZonaCercana { nombre: string; km: number; texto: string }

/** «en Reus» (< 3 km), «cerca de Reus» (< 15 km) o «a 23 km de Reus». null si las coordenadas no valen. */
export function zonaCercana(lat: number | null | undefined, lng: number | null | undefined, zonas: readonly Zona[] = ZONAS): ZonaCercana | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || !zonas.length) return null;
  let mejor = zonas[0], d = Infinity;
  for (const z of zonas) {
    const k = distanciaKm({ lat, lng }, z);
    if (k < d) { d = k; mejor = z; }
  }
  const art = mejor.el ? "el " : "";
  const texto = d < EN_KM ? `en ${art}${mejor.nombre}`
    : d < CERCA_KM ? `cerca ${mejor.el ? "del " : "de "}${mejor.nombre}`
    : `a ${Math.round(d)} km ${mejor.el ? "del " : "de "}${mejor.nombre}`;
  return { nombre: mejor.nombre, km: Math.round(d * 10) / 10, texto };
}
