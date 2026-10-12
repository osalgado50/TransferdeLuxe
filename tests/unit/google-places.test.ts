import { describe, expect, it, vi } from "vitest";
import { crearGooglePlaces, googleDesdeEntorno, parsearAutocompletado, parsearDetalle, placeIdValido } from "@/lib/geocodificacion/google";
import { crearBuscador } from "@/lib/geocodificacion/buscador";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const PID = "ChIJdemoPlaceId_123";
const sugerencias = { suggestions: [
  { placePrediction: { placeId: PID, text: { text: "Logística Ejemplo SL, Reus" }, structuredFormat: { mainText: { text: "Logística Ejemplo SL" }, secondaryText: { text: "Carrer Demo, Reus, España" } } } },
  { placePrediction: { placeId: "malo/../x", text: { text: "X" } } },
  { queryPrediction: { text: { text: "logistica" } } },
] };

describe("parseo de Google Places (New)", () => {
  it("autocompletado sin coordenadas, con placeId", () => {
    expect(parsearAutocompletado(sugerencias)).toEqual([
      { etiqueta: "Logística Ejemplo SL · Carrer Demo, Reus, España", lat: null, lng: null, frecuente: false, fuente: "google", placeId: PID },
    ]);
    expect(parsearAutocompletado({})).toEqual([]);
    expect(parsearAutocompletado(null)).toBeNull();
  });
  it("detalle con nombre y dirección", () => {
    expect(parsearDetalle({ location: { latitude: 41.15, longitude: 1.1 }, displayName: { text: "Logística Ejemplo SL" }, formattedAddress: "Carrer Demo, Reus" }))
      .toEqual({ etiqueta: "Logística Ejemplo SL · Carrer Demo, Reus", lat: 41.15, lng: 1.1 });
    expect(parsearDetalle({ displayName: { text: "x" } })).toBeNull();
  });
  it("valida el placeId", () => {
    expect(placeIdValido(PID)).toBe(true);
    expect(placeIdValido("../../x")).toBe(false);
  });
});

describe("crearGooglePlaces", () => {
  it("autocompleta con la clave en cabecera y sesgo a la Costa Dorada", async () => {
    const f = vi.fn(async () => json(sugerencias));
    const r = await crearGooglePlaces("k-prueba", f as unknown as typeof fetch).autocompletar("logistica");
    expect(r?.[0].placeId).toBe(PID);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("k-prueba");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ input: "logistica", languageCode: "es", locationBias: { circle: { center: { latitude: 41.08, longitude: 1.14 } } } });
  });
  it("detalle pide solo los campos necesarios; null en error o id inválido", async () => {
    const f = vi.fn(async () => json({ location: { latitude: 41.1, longitude: 1.1 }, formattedAddress: "Reus" }));
    const g = crearGooglePlaces("k", f as unknown as typeof fetch);
    expect(await g.detalle(PID)).toEqual({ etiqueta: "Reus", lat: 41.1, lng: 1.1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/places/${PID}`);
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("displayName,formattedAddress,location");
    expect(await g.detalle("../x")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(await crearGooglePlaces("k", (async () => json({}, 403)) as unknown as typeof fetch).autocompletar("x")).toBeNull();
    expect(await crearGooglePlaces("k", (async () => { throw new Error("t"); }) as unknown as typeof fetch).detalle(PID)).toBeNull();
  });
  it("sin GOOGLE_PLACES_API_KEY no existe el proveedor", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(googleDesdeEntorno()).toBeNull();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    expect(googleDesdeEntorno()).not.toBeNull();
    vi.unstubAllEnvs();
  });
  it("con Google, el buscador lo usa primero y cae a Photon si falla", async () => {
    const google = crearGooglePlaces("k", (async () => json({}, 500)) as unknown as typeof fetch);
    const f = vi.fn(async () => json({ features: [{ geometry: { coordinates: [1.1, 41.1] }, properties: { name: "Reus", countrycode: "ES", county: "Baix Camp" } }] }));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, google });
    expect(b.hayGoogle()).toBe(true);
    expect((await b.buscar("reus"))[0].fuente).toBe("photon");
  });
});
