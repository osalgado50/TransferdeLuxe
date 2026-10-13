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
    expect(r).toEqual([{ etiqueta: "Hotel Demo Playa · Carrer de Prova 12-14 · Salou", lat: 41.063, lng: 1.1588, frecuente: false, fuente: "photon",
      tipo: "poi", calle: "Carrer de Prova", numero: "12-14", localidad: "Salou" }]);
  });
  it("clasifica dirección, calle, población y descarta paradas de bus", () => {
    const r = parsearPhoton({ features: [
      feature({ street: "Carrer de Sant Joan", housenumber: "10", city: "Reus", type: "house", osm_key: "place", osm_value: "house" }),
      feature({ name: "Avinguda del Doctor Eduard Punset", city: "Salou", type: "street", osm_key: "highway" }),
      feature({ name: "Salou", county: "Tarragonès", type: "city", osm_key: "place" }),
      feature({ name: "Parada Hotel Demo", street: "Carrer X", city: "Salou", type: "house", osm_key: "highway", osm_value: "bus_stop" }),
    ] });
    expect(r?.map((l) => [l.tipo, l.etiqueta, l.calle ?? null])).toEqual([
      ["direccion", "Carrer de Sant Joan 10 · Reus", "Carrer de Sant Joan"],
      ["calle", "Avinguda del Doctor Eduard Punset · Salou", "Avinguda del Doctor Eduard Punset"],
      ["localidad", "Salou · Tarragonès", null],
    ]);
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

describe("parsearNominatim", () => {
  it("sin detalle de dirección: etiqueta larga tal cual", () => {
    expect(parsearNominatim([{ display_name: "Reus, Tarragona", lat: "41.15", lon: "1.10" }, { display_name: "x", lat: "no" }]))
      .toEqual([{ etiqueta: "Reus, Tarragona", lat: 41.15, lng: 1.1, frecuente: false, fuente: "nominatim", tipo: "poi", calle: undefined, numero: undefined, localidad: undefined }]);
    expect(parsearNominatim({})).toBeNull();
  });
  it("con addressdetails: «Calle nº · Localidad», tipo y sin paradas", () => {
    const r = parsearNominatim([
      { display_name: "Avinguda del Doctor Eduard Punset, Salou, Tarragonès…", lat: "41.0836", lon: "1.1428", name: "Avinguda del Doctor Eduard Punset", addresstype: "road", address: { road: "Avinguda del Doctor Eduard Punset", town: "Salou", county: "Tarragonès" } },
      { display_name: "10, Carrer de Sant Joan, Reus…", lat: "41.156", lon: "1.1061", name: "", addresstype: "place", address: { road: "Carrer de Sant Joan", house_number: "10", city: "Reus" } },
      { display_name: "Hotel Demo, …", lat: "41.07", lon: "1.15", name: "Hotel Demo", addresstype: "tourism", address: { road: "Carrer de Prova", town: "Salou" } },
      { display_name: "Parada", lat: "41.07", lon: "1.15", name: "Parada", type: "bus_stop", addresstype: "highway", address: { road: "Carrer X", town: "Salou" } },
    ]);
    expect(r?.map((l) => [l.tipo, l.etiqueta])).toEqual([
      ["calle", "Avinguda del Doctor Eduard Punset · Salou"], ["direccion", "Carrer de Sant Joan 10 · Reus"], ["poi", "Hotel Demo · Carrer de Prova · Salou"],
    ]);
  });
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
  const reloj = () => {
    const r = { t: 0, ahora: () => r.t, dormir: async (ms: number) => { r.t += ms; } };
    return r;
  };
  const calle = { name: "Avinguda del Doctor Eduard Punset", city: "Salou", type: "street", countrycode: "ES" };
  const nomi = [{ display_name: "Avinguda del Doctor Eduard Punset, Salou", lat: "41.0836", lon: "1.1428", name: "Avinguda del Doctor Eduard Punset", addresstype: "road", address: { road: "Avinguda del Doctor Eduard Punset", town: "Salou" } }];

  it("Photon y Nominatim en paralelo, con caja alrededor de la localidad, fusionados y con caché de 24 h", async () => {
    const r = reloj();
    const f = vi.fn(async (url: string) => (url.includes("photon") ? json({ features: [feature(calle, [1.1428, 41.0836])] }) : json(nomi)));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: r.ahora, dormir: r.dormir });
    const res = await b.buscar("Dr. Eduard Punset 7, 3-1 de Salou. Tarragona");
    expect(res).toEqual([{ etiqueta: "Avinguda del Doctor Eduard Punset, 7 · Salou (número aproximado)", lat: 41.0836, lng: 1.1428, frecuente: false, fuente: "photon", aproximado: true }]);
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("photon.komoot.io/api/?q=Doctor%20Eduard%20Punset%207%20Salou&lat=41.0764&lon=1.1416");
    expect(urls[0]).toMatch(/&bbox=1\.04\d*,41\.00\d*,1\.23\d*,41\.14\d*$/);
    expect(urls[1]).toContain("nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1");
    expect(urls[1]).toMatch(/viewbox=1\.04\d*,41\.14\d*,1\.23\d*,41\.00\d*&bounded=1/);
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)["User-Agent"]).toMatch(/TransferdeLuxe/);
    r.t += 60_000;
    await b.buscar("Dr. Eduard Punset 7, 3-1 de Salou. Tarragona");
    expect(f).toHaveBeenCalledTimes(2); // de la caché
    r.t += 25 * 3600_000;
    await b.buscar("Dr. Eduard Punset 7, 3-1 de Salou. Tarragona");
    expect(f).toHaveBeenCalledTimes(4); // caducada
  });
  it("sin localidad: Photon sin caja y Nominatim limitado a la región", async () => {
    const f = vi.fn(async () => json([]));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ...reloj() });
    await b.buscar("Sol Piramides");
    const urls = f.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls.find((u) => u.includes("photon"))).not.toContain("bbox");
    expect(urls.find((u) => u.includes("nominatim"))).toContain("viewbox=0.15,42.9,3.35,40.5&bounded=1");
  });
  it("si la consulta limpia no da nada, prueba el núcleo (respaldo) respetando 1 petición/s", async () => {
    const r = reloj();
    const f = vi.fn(async (url: string) => {
      if (!url.includes("photon")) return json([]);
      return json({ features: url.includes("q=piramide&") ? [feature({ name: "Sol Piramides Demo", street: "Carrer de Prova", city: "Salou", type: "house", osm_key: "tourism", countrycode: "ES" })] : [] });
    });
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: r.ahora, dormir: r.dormir });
    const res = await b.buscar("hotel piramide salou");
    expect(res.map((l) => l.etiqueta)).toEqual(["Sol Piramides Demo · Carrer de Prova · Salou"]);
    const ph = f.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("photon"));
    expect(ph.map((u) => decodeURIComponent(u.split("q=")[1].split("&")[0]))).toEqual(["hotel piramide Salou", "piramide"]);
    expect(r.t).toBeGreaterThanOrEqual(1000); // esperó su turno
  });
  it("si un proveedor falla se usa el otro; los fallos no se guardan en caché", async () => {
    const r = reloj();
    const f = vi.fn(async (url: string) => (url.includes("photon") ? json({}, 503) : json([{ display_name: "Reus", lat: "41.1", lon: "1.1" }])));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: r.ahora, dormir: r.dormir });
    expect((await b.buscar("reus"))[0].fuente).toBe("nominatim");
    r.t += 10_000;
    f.mockImplementation(async () => { throw new Error("red"); });
    expect(await b.buscar("otra cosa")).toEqual([]);
    r.t += 10_000;
    expect(await b.buscar("otra cosa")).toEqual([]);
    expect(f).toHaveBeenCalledTimes(6); // sin caché de fallos: reintenta ambos
  });
  it("cola de 1 petición/s por proveedor: espera hasta 2 s y si no, se salta", async () => {
    const r = reloj();
    const f = vi.fn(async () => json([]));
    const b = crearBuscador({ fetch: f as unknown as typeof fetch, ahora: () => r.t, dormir: async () => {} }); // el reloj no avanza
    await Promise.all([b.buscar("Sol"), b.buscar("Luna"), b.buscar("Mar"), b.buscar("Cielo")]);
    const n = (p: string) => f.mock.calls.filter((c) => String((c as unknown[])[0]).includes(p)).length;
    expect(n("photon")).toBe(3); // turnos en 0, 1 y 2 s; el cuarto tendría que esperar 3 s → se salta
    expect(n("nominatim")).toBe(3);
  });
  it("sin Google no hay detalle", async () => {
    const b = crearBuscador({ fetch: vi.fn() as unknown as typeof fetch });
    expect(b.hayGoogle()).toBe(false);
    expect(await b.detalle("ChIJ1234567890")).toBeNull();
  });
});
