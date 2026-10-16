import { expect, test } from "vitest";
import { DESTINOS_FRECUENTES, leerIdioma, TEXTOS } from "@/lib/i18n/portada";

test("idioma: ?lang manda; si no, el del navegador; castellano por defecto", () => {
  expect(leerIdioma("ca", "en-GB,en;q=0.9")).toBe("ca");
  expect(leerIdioma(undefined, "ca-ES,ca;q=0.9,es;q=0.8")).toBe("ca");
  expect(leerIdioma(undefined, "en-US,en;q=0.9")).toBe("en");
  expect(leerIdioma(undefined, "fr-FR,fr;q=0.9,es;q=0.5")).toBe("es");
  expect(leerIdioma("de", null)).toBe("es");
});
test("los tres idiomas tienen los mismos textos y destinos", () => {
  const claves = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? claves(v).map((c) => `${k}.${c}`) : [k])).sort();
  expect(claves(TEXTOS.ca)).toEqual(claves(TEXTOS.es));
  expect(claves(TEXTOS.en)).toEqual(claves(TEXTOS.es));
  expect(TEXTOS.ca.hero.destinos).toHaveLength(TEXTOS.es.hero.destinos.length);
  for (const d of DESTINOS_FRECUENTES) expect(Object.keys(d.nombre).sort()).toEqual(["ca", "en", "es"]);
});
