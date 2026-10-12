import { describe, expect, it, vi } from "vitest";
import {
  atribucion, combinarSugerencias, etiquetaPhoton, normalizarBusqueda, parsearNominatim, parsearPhoton, puntuarCoincidencia, textoConNombre,
} from "@/lib/dominio/geocodificacion";
import { crearBuscador } from "@/lib/geocodificacion/buscador";

const feature = (props: Record<string, unknown>, coords = [1.1588, 41.063]) => ({ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: props });
const hotel = { name: "Hotel Demo Playa", street: "Carrer de Prova", housenumber: "12-14", locality: "els Bergs", city: "Salou", county: "Tarragonès", state: "Catalunya", countrycode: "ES", type: "house" };

describe("normalizar y puntuar", () => {
  it("quita acentos, mayúsculas y espacios", () => expect(normalizarBusqueda("  Logística   ÉXITO ")).toBe("logistica exito"));
  it("puntúa prefijo, palabra y contenido", () => {
    expect(puntuarCoincidencia("Logística Ejemplo SL", "logis")).toBe(0);
    expect(puntuarCoincidencia("Logística Ejemplo SL", "ejemplo")).toBe(0);
    expect(puntuarCoincidencia("Logística Ejemplo SL", "jemplo")).toBe(1);
    expect(puntuarCoincidencia("Logística Ejemplo SL", "zzz")).toBe(2);
    expect(puntuarCoincidencia("x", "  ")).toBe(2);
  });
});

describe("etiquetaPhoton", () => {
  it("nombre · calle nº · localidad", () => expect(etiquetaPhoton(hotel)).toBe("Hotel Demo Playa · Carrer de Prova 12-14 · Salou"));
  it("sin nombre: calle y localidad", () => expect(etiquetaPhoton({ street: "Carrer Major", housenumber: "5", city: "Reus" })).toBe("Carrer Major 5 · Reus"));
  it("población suelta: añade la comarca", () => expect(etiquetaPhoton({ name: "Salou", county: "Tarragonès", state: "Catalunya", type: "city" })).toBe("Salou · Tarragonès"));
  it("no repite partes iguales", () => expect(etiquetaPhoton({ name: "Salou", street: "Passeig de Miramar", city: "Salou" })).toBe("Salou · Passeig de Miramar"));
  it("calle sin número", () => expect(etiquetaPhoton({ name: "Carrer Major", city: "Salou", type: "street" })).toBe("Carrer Major · Salou"));
});

describe("parsearPhoton", () => {
  it("convierte GeoJSON (lon, lat) y marca la fuente", () => {
    const r = parsearPhoton({ features: [feature(hotel)] });
    expect(r).toEqual([{ etiqueta: "Hotel Demo Playa · Carrer de Prova 12-14 · Salou", lat: 41.063, lng: 1.1588, frecuente: false, fuente: "photon" }]);
  });
  it("descarta otros países (acepta España y Andorra) y repetidos", () => {
    const r = parsearPhoton({ features: [
      feature({ name: "Salou", countrycode: "FR", city: "Paris" }), feature({ name: "Pas de la Casa", countrycode: "AD", county: "Encamp" }),
      feature(hotel), feature(hotel, [1.2, 41.1]), feature({ name: "Sin coords" }, ["x", 1] as unknown as number[]),
    ] });
    expect(r?.map((l) => l.etiqueta)).toEqual(["Pas de la Casa · Encamp", "Hotel Demo Playa · Carrer de Prova 12-14 · Salou"]);
  });
  it("null si no es una respuesta de Photon", () => {
    expect(parsearPhoton(null)).toBeNull();
    expect(parsearPhoton({ lang: [{ message: "no" }] })).toBeNull();
  });
});

it("parsearNominatim", () => {
  expect(parsearNominatim([{ display_name: "Reus, Tarragona", lat: "41.15", lon: "1.10" }, { display_name: "x", lat: "no" }]))
    .toEqual([{ etiqueta: "Reus, Tarragona", lat: 41.15, lng: 1.1, frecuente: false, fuente: "nominatim" }]);
  expect(parsearNominatim({})).toBeNull();
});

it("combinarSugerencias: empresa, favoritos, frecuentes y externos, sin repetir", () => {
  const l = (etiqueta: string, fuente: "empresa" | "favorito" | "frecuente" | "photon") => ({ etiqueta, lat: 1, lng: 1, frecuente: fuente !== "photon", fuente });
  const r = combinarSugerencias({ externos: [l("Salou", "photon"), l("Puerto", "photon")], frecuentes: [l("salou", "frecuente")], favoritos: [l("Casa", "favorito")], empresa: [l("Logística", "empresa")] });
  expect(r.map((x) => x.fuente)).toEqual(["empresa", "favorito", "frecuente", "photon"]);
});

it("textoConNombre no repite el nombre", () => {
  expect(textoConNombre("Logística Ejemplo SL", "Carrer Major 5 · Reus")).toBe("Logística Ejemplo SL · Carrer Major 5 · Reus");
  expect(textoConNombre("Hotel Demo", "Hotel Demo · Carrer 1 · Salou")).toBe("Hotel Demo · Carrer 1 · Salou");
});

it("atribucion según la fuente", () => {
  expect(atribucion([{ fuente: "empresa" }])).toBeNull();
  expect(atribucion([{ fuente: "photon" }])).toBe("Búsqueda: Photon / © OpenStreetMap");
  expect(atribucion([{ fuente: "nominatim" }])).toContain("OpenStreetMap");
  expect(atribucion([{ fuente: "google" }])).toBe("Búsqueda: Google");
});

describe("crearBuscador", () => {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  it("usa Photon con sesgo a la Costa Dorada, User-Agent propio y caché", async () => {
    let t = 0;
    const f = vi.fn(async () => json({ features: [feature(hotel)] }));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: () => t });
    expect((await b.buscar("hotel demo"))[0].fuente).toBe("photon");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("photon.komoot.io/api/?q=hotel%20demo&lat=41.08&lon=1.14&limit=8");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/TransferdeLuxe/);
    t = 5000;
    await b.buscar("Hotel Demo");
    expect(f).toHaveBeenCalledTimes(1); // de la caché
  });
  it("si Photon falla usa Nominatim; no cachea los fallos", async () => {
    let t = 0;
    const f = vi.fn(async (url: string) => (url.includes("photon") ? json({}, 503) : json([{ display_name: "Reus", lat: "41.1", lon: "1.1" }])));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: () => t });
    expect((await b.buscar("reus"))[0].fuente).toBe("nominatim");
    expect(f).toHaveBeenCalledTimes(2);
    t = 10_000;
    f.mockImplementation(async () => { throw new Error("red"); });
    expect(await b.buscar("otra")).toEqual([]);
    t = 20_000;
    expect(await b.buscar("otra")).toEqual([]);
    expect(f).toHaveBeenCalledTimes(6); // sin caché de fallos: reintenta ambos
  });
  it("como mucho 1 petición por segundo a cada proveedor", async () => {
    let t = 0;
    const f = vi.fn(async (url: string) => (url.includes("photon") ? json({ features: [feature(hotel)] }) : json([])));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: () => t });
    await b.buscar("uno");
    t = 300;
    await b.buscar("dos"); // Photon sin hueco → Nominatim
    t = 600;
    expect(await b.buscar("tres")).toEqual([]); // ninguno con hueco: sin petición
    expect(f.mock.calls.map((c) => (String(c[0]).includes("photon") ? "p" : "n"))).toEqual(["p", "n"]);
  });
  it("sin Google no hay detalle", async () => {
    const b = crearBuscador({ fetch: vi.fn() as unknown as typeof fetch });
    expect(b.hayGoogle()).toBe(false);
    expect(await b.detalle("ChIJ1234567890")).toBeNull();
  });
});
