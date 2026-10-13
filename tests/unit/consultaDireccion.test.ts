import { describe, expect, it } from "vitest";
import { analizarConsulta, cajaAlrededor, LOCALIDADES, normalizarConsulta, variantesConsulta } from "@/lib/dominio/consultaDireccion";
import { deLaLocalidad, fusionarResultados, palabrasQueFaltan, type Candidato } from "@/lib/dominio/geocodificacion";

const ver = (q: string) => {
  const c = analizarConsulta(q);
  return { limpia: c.limpia, numero: c.numero, localidad: c.localidad?.nombre ?? null, nucleo: c.nucleo };
};

describe("analizarConsulta: casos reales que fallaban en producción", () => {
  it("«Dr. Eduard Punset 7, 3-1 de Salou. Tarragona»", () =>
    expect(ver("Dr. Eduard Punset 7, 3-1 de Salou. Tarragona")).toEqual({ limpia: "Doctor Eduard Punset 7 Salou", numero: "7", localidad: "Salou", nucleo: "Doctor Eduard Punset" }));
  it("«Carrer Eduard Punset Salou» (tipo de vía equivocado)", () =>
    expect(ver("Carrer Eduard Punset Salou")).toEqual({ limpia: "Carrer Eduard Punset Salou", numero: null, localidad: "Salou", nucleo: "Carrer Eduard Punset" }));
  it("«Eduard Punset 7 Salou»", () =>
    expect(ver("Eduard Punset 7 Salou")).toEqual({ limpia: "Eduard Punset 7 Salou", numero: "7", localidad: "Salou", nucleo: "Eduard Punset" }));
  it("«Carrer Barcelona 10 Salou»: Barcelona es la calle, Salou la localidad", () =>
    expect(ver("Carrer Barcelona 10 Salou")).toEqual({ limpia: "Carrer Barcelona 10 Salou", numero: "10", localidad: "Salou", nucleo: "Carrer Barcelona" }));
  it("«hotel piramide salou»: sin «hotel» (Photon tarda > 5 s con él y no lo encuentra)", () => {
    expect(ver("hotel piramide salou")).toEqual({ limpia: "piramide Salou", numero: null, localidad: "Salou", nucleo: "piramide" });
    expect(ver("Hotel Salou Park")).toMatchObject({ limpia: "Salou Park", localidad: "Salou" });
    expect(ver("hotel salou")).toMatchObject({ limpia: "hotel Salou", localidad: "Salou" }); // solo queda la localidad: se conserva
  });
  it("«Avinguda Carles Buïgas 28 Salou», «Passeig Jaume I 5 Salou», «Carrer de Sant Joan 10 Reus»", () => {
    expect(ver("Avinguda Carles Buïgas 28 Salou")).toMatchObject({ numero: "28", localidad: "Salou", nucleo: "Avinguda Carles Buïgas" });
    expect(ver("Passeig Jaume I 5 Salou")).toMatchObject({ numero: "5", localidad: "Salou", nucleo: "Passeig Jaume I" });
    expect(ver("Carrer de Sant Joan 10 Reus")).toMatchObject({ limpia: "Carrer de Sant Joan 10 Reus", numero: "10", localidad: "Reus" });
  });
  it("lugares que ya funcionaban siguen igual", () => {
    expect(ver("aeropuerto reus")).toMatchObject({ limpia: "aeropuerto Reus", localidad: "Reus" });
    expect(ver("Reus")).toMatchObject({ limpia: "Reus", localidad: "Reus", nucleo: "" });
    expect(ver("Sol Piramides")).toEqual({ limpia: "Sol Piramides", numero: null, localidad: null, nucleo: "Sol Piramides" });
  });
});

describe("normalizarConsulta: abreviaturas", () => {
  it.each([
    ["Avda. Pere III 12 Salou", "Avinguda Pere III 12 Salou"],
    ["Av Jaume I 3 Salou", "Avinguda Jaume I 3 Salou"],
    ["C/ Major 5 Cambrils", "Carrer Major 5 Cambrils"],
    ["c/Major 5 Cambrils", "Carrer Major 5 Cambrils"],
    ["C. Major 5 Cambrils", "Carrer Major 5 Cambrils"],
    ["Pg. Miramar 20 Salou", "Passeig Miramar 20 Salou"],
    ["Pº Miramar 20 Salou", "Passeig Miramar 20 Salou"],
    ["Ctra. de Salou 10 Reus", "Carretera de Salou 10 Reus"],
    ["Pl. de la Font 1 Tarragona", "Plaça de la Font 1 Tarragona"],
    ["Pza. Europa 2 Salou", "Plaça Europa 2 Salou"],
    ["Urb. Las Mimosas 4 Miami Platja", "Urbanització Las Mimosas 4 Miami Platja"],
    ["Dra. Ferrer 3 Reus", "Doctora Ferrer 3 Reus"],
    ["Carrer Major s/n Reus", "Carrer Major Reus"],
    ["Carrer Major nº 5 Reus", "Carrer Major 5 Reus"],
  ])("«%s» → «%s»", (q, esperado) => expect(normalizarConsulta(q)).toBe(esperado));
});

describe("normalizarConsulta: piso, puerta y escalera fuera", () => {
  it.each([
    ["Carrer Major 7, 3-1, Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7 3º 1ª Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7 3o 1a Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7, bajo, Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7 bajos B Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7, ático, Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7 esc. B 2º 1ª Salou", "Carrer Major 7 Salou"],
    ["Pº Miramar 20 esc. B piso 2 puerta 3, La Pineda", "Passeig Miramar 20 La Pineda"],
    ["Carrer Major 7, 2º izq., Salou", "Carrer Major 7 Salou"],
    ["Carrer Major 7 3ºB Salou", "Carrer Major 7 Salou"],
  ])("«%s» → «%s»", (q, esperado) => expect(normalizarConsulta(q)).toBe(esperado));
  it("piso sin número de portal: no se confunde con el portal", () =>
    expect(ver("Urb. Las Mimosas 3o 1a Miami Platja")).toMatchObject({ limpia: "Urbanització Las Mimosas Miami Platja", numero: null }));
  it("portal con rango o letra se conserva", () => {
    expect(ver("Carrer Major 12-14 L'Hospitalet de l'Infant")).toMatchObject({ numero: "12-14", localidad: "L'Hospitalet de l'Infant" });
    expect(ver("Carrer Major 7B Reus").numero).toBe("7B");
  });
  it("«11 de Setembre» es nombre de calle, no portal", () =>
    expect(ver("Carrer 11 de Setembre 5 Salou")).toMatchObject({ numero: "5", nucleo: "Carrer 11 de Setembre" }));
});

describe("normalizarConsulta: provincia, país y código postal fuera", () => {
  it("«Avda. Pere III 12, 3º 1ª, 43840 Salou (Tarragona), España»", () =>
    expect(ver("Avda. Pere III 12, 3º 1ª, 43840 Salou (Tarragona), España")).toEqual({ limpia: "Avinguda Pere III 12 Salou", numero: "12", localidad: "Salou", nucleo: "Avinguda Pere III" }));
  it("«…, Cambrils, Tarragona, Catalunya»", () => expect(normalizarConsulta("Carrer Major 5, Cambrils, Tarragona, Catalunya")).toBe("Carrer Major 5 Cambrils"));
  it("Tarragona sola es la localidad", () => expect(ver("Rambla Nova 10 Tarragona")).toMatchObject({ localidad: "Tarragona", limpia: "Rambla Nova 10 Tarragona" }));
  it("«de Salou» / «en Cambrils» → la localidad sin preposición", () => {
    expect(normalizarConsulta("Carrer Major 5 de Salou")).toBe("Carrer Major 5 Salou");
    expect(normalizarConsulta("Carrer Major 5 en Cambrils")).toBe("Carrer Major 5 Cambrils");
  });
});

describe("detectar la localidad", () => {
  it("la del nombre de la calle no cuenta", () => {
    expect(ver("Avinguda de Tarragona 5 Reus").localidad).toBe("Reus");
    expect(ver("Carrer de Salou 10 Cambrils").localidad).toBe("Cambrils");
    expect(ver("Carretera de Valls 3").localidad).toBeNull();
  });
  it.each([
    ["Carrer Major 1 la pineda", "La Pineda"], ["Carrer Major 1 Pineda", "La Pineda"], ["Carrer Major 1 vilaseca", "Vila-seca"],
    ["Carrer Major 1 Vila-seca", "Vila-seca"], ["Carrer Major 1 montroig", "Mont-roig del Camp"], ["Carrer Major 1 Mont-roig del Camp", "Mont-roig del Camp"],
    ["Carrer Major 1 miami playa", "Miami Platja"], ["Carrer Major 1 l'hospitalet de l'infant", "L'Hospitalet de l'Infant"],
    ["Carrer Major 1 Hospitalet del Infante", "L'Hospitalet de l'Infant"], ["Carrer Major 1 torredembarra", "Torredembarra"],
    ["Carrer Major 1 ALTAFULLA", "Altafulla"], ["Carrer Major 1 Valls", "Valls"], ["Carrer Major 1 Cambrils", "Cambrils"],
  ])("«%s» → %s", (q, l) => expect(ver(q).localidad).toBe(l));
  it("nombre oficial en la consulta limpia", () => expect(normalizarConsulta("c/Llevant s/n, montroig")).toBe("Carrer Llevant Mont-roig del Camp"));
  it("no detecta aeropuertos ni estaciones como localidad", () => expect(LOCALIDADES.some((l) => /Aeropuerto|Estación|PortAventura/.test(l.nombre))).toBe(false));
});

it("variantesConsulta: limpia y núcleo sin repetir", () => {
  expect(variantesConsulta(analizarConsulta("hotel piramide salou"))).toEqual(["piramide Salou", "piramide"]);
  expect(variantesConsulta(analizarConsulta("Sol Piramides"))).toEqual(["Sol Piramides"]);
  expect(variantesConsulta(analizarConsulta("Reus"))).toEqual(["Reus"]);
});

it("cajaAlrededor: ~8 km a cada lado", () => {
  const [o, s, e, n] = cajaAlrededor(41.0764, 1.1416);
  expect(n - s).toBeCloseTo(0.1437, 3);
  expect(e - o).toBeCloseTo(0.1906, 3);
  expect(s).toBeLessThan(41.0764);
  expect(e).toBeGreaterThan(1.1416);
});

describe("fusionarResultados", () => {
  const c = (x: Partial<Candidato> & Pick<Candidato, "etiqueta" | "tipo">): Candidato => ({ lat: 41.08, lng: 1.14, frecuente: false, fuente: "photon", ...x });
  const salou = LOCALIDADES.find((l) => l.nombre === "Salou")!;

  it("calle sin el portal tecleado → número aproximado con coordenadas de la calle", () => {
    const r = fusionarResultados([[c({ etiqueta: "Avinguda del Doctor Eduard Punset · Salou", tipo: "calle", calle: "Avinguda del Doctor Eduard Punset", localidad: "Salou", lat: 41.0836, lng: 1.1428 })]],
      { numero: "7", localidad: salou });
    expect(r).toEqual([{ etiqueta: "Avinguda del Doctor Eduard Punset, 7 · Salou (número aproximado)", lat: 41.0836, lng: 1.1428, frecuente: false, fuente: "photon", aproximado: true }]);
  });
  it("sin número tecleado la calle queda tal cual", () => {
    const r = fusionarResultados([[c({ etiqueta: "Carrer Major · Salou", tipo: "calle", calle: "Carrer Major", localidad: "Salou" })]], { numero: null, localidad: null });
    expect(r[0]).toEqual({ etiqueta: "Carrer Major · Salou", lat: 41.08, lng: 1.14, frecuente: false, fuente: "photon" });
  });
  it("quita repetidos entre Photon y Nominatim (misma calle o < 30 m)", () => {
    const r = fusionarResultados([
      [c({ etiqueta: "Carrer de Barcelona · Salou", tipo: "calle", calle: "Carrer de Barcelona", localidad: "Salou", lat: 41.0777, lng: 1.1315 }),
        c({ etiqueta: "Carrer de Barcelona · Salou", tipo: "calle", calle: "Carrer de Barcelona", localidad: "Salou", lat: 41.081, lng: 1.132 })],
      [c({ etiqueta: "Carrer de Barcelona · Salou", tipo: "calle", calle: "Carrer de Barcelona", localidad: "Salou", lat: 41.0833, lng: 1.1321, fuente: "nominatim" }),
        c({ etiqueta: "Hotel Demo · Salou", tipo: "poi", lat: 41.07, lng: 1.15, fuente: "nominatim" }),
        c({ etiqueta: "Hotel Demo Playa · Salou", tipo: "poi", lat: 41.0701, lng: 1.1501, fuente: "nominatim" })],
    ], { numero: "10", localidad: salou });
    expect(r.map((x) => x.etiqueta)).toEqual(["Carrer de Barcelona, 10 · Salou (número aproximado)", "Hotel Demo · Salou"]);
  });
  it("orden: localidad detectada > cercanía a la Costa Dorada > tipo", () => {
    const r = fusionarResultados([[
      c({ etiqueta: "Carrer de Salou 10 · Barcelona", tipo: "direccion", calle: "Carrer de Salou", numero: "10", localidad: "Barcelona", lat: 41.38, lng: 2.17 }),
      c({ etiqueta: "Carrer de Barcelona · Cambrils", tipo: "calle", calle: "Carrer de Barcelona", localidad: "Cambrils", lat: 41.0701, lng: 1.0518 }),
      c({ etiqueta: "Bar Barcelona · Salou", tipo: "poi", localidad: "Salou", lat: 41.078, lng: 1.131 }),
      c({ etiqueta: "Carrer de Barcelona · Salou", tipo: "calle", calle: "Carrer de Barcelona", localidad: "Salou", lat: 41.0777, lng: 1.1315 }),
    ]], { numero: "10", localidad: salou, nucleo: "Carrer Barcelona" });
    expect(r.map((x) => x.etiqueta)).toEqual([
      "Carrer de Barcelona, 10 · Salou (número aproximado)", "Bar Barcelona · Salou",
      "Carrer de Barcelona, 10 · Cambrils (número aproximado)", "Carrer de Salou 10 · Barcelona",
    ]);
  });
  it("dirección exacta antes que calle; las palabras buscadas pesan antes que el tipo", () => {
    const r = fusionarResultados([[
      c({ etiqueta: "Hotel Port Demo · Salou", tipo: "poi", localidad: "Salou", lat: 41.07 }),
      c({ etiqueta: "Sol Piramides Demo · Salou", tipo: "poi", localidad: "Salou", lat: 41.075 }),
    ]], { numero: null, localidad: salou, nucleo: "piramide" });
    expect(r[0].etiqueta).toBe("Sol Piramides Demo · Salou");
    const r2 = fusionarResultados([[
      c({ etiqueta: "Carrer Major · Reus", tipo: "calle", calle: "Carrer Major", localidad: "Reus", lat: 41.156, lng: 1.106 }),
      c({ etiqueta: "Carrer Major 5 · Reus", tipo: "direccion", calle: "Carrer Major", numero: "5", localidad: "Reus", lat: 41.157, lng: 1.107 }),
    ]], { numero: "5", localidad: LOCALIDADES.find((l) => l.nombre === "Reus")! });
    expect(r2.map((x) => x.etiqueta)).toEqual(["Carrer Major 5 · Reus"]); // con el portal exacto, la calle aproximada sobra
  });
  it("como mucho 8", () => {
    const muchos = Array.from({ length: 12 }, (_, i) => c({ etiqueta: `Lugar ${i}`, tipo: "poi", lat: 41 + i / 100 }));
    expect(fusionarResultados([muchos], { numero: null, localidad: null })).toHaveLength(8);
  });
});

it("deLaLocalidad: por municipio (La Pineda es de Vila-seca) o a menos de 3 km", () => {
  const pineda = LOCALIDADES.find((l) => l.nombre === "La Pineda")!;
  expect(deLaLocalidad({ lat: 0, lng: 0, localidad: "Vila-seca" }, pineda)).toBe(true);
  expect(deLaLocalidad({ lat: 41.076, lng: 1.19 }, pineda)).toBe(true);
  expect(deLaLocalidad({ lat: 41.15, lng: 1.1, localidad: "Reus" }, pineda)).toBe(false);
});

it("palabrasQueFaltan ignora el tipo de vía y acepta prefijos", () => {
  expect(palabrasQueFaltan("Sol Piramides Salou", "piramide")).toBe(0);
  expect(palabrasQueFaltan("Avinguda del Doctor Eduard Punset · Salou", "Carrer Eduard Punset")).toBe(0);
  expect(palabrasQueFaltan("Carrer d'Eduard Toldrà · Salou", "Carrer Eduard Punset")).toBe(1);
});
