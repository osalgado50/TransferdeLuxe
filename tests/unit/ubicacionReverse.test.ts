import { expect, test } from "vitest";
import { lugarDesdeReverse } from "@/lib/dominio/geocodificacion";

test("«Usar mi ubicación»: de la respuesta reverse a «Calle nº · Localidad» con las coordenadas del móvil", () => {
  const r = lugarDesdeReverse({ display_name: "12, Carrer de Barcelona, Salou, Tarragonès, Tarragona, Catalunya, 43840, España", lat: "41.0771", lon: "1.1402",
    addresstype: "building", address: { road: "Carrer de Barcelona", house_number: "12", town: "Salou", county: "Tarragonès" } }, 41.07712, 1.14031);
  expect(r).toEqual({ etiqueta: "Carrer de Barcelona 12 · Salou", lat: 41.07712, lng: 1.14031, frecuente: false, fuente: "nominatim" });
  // Un hotel: el nombre delante.
  expect(lugarDesdeReverse({ display_name: "Hotel X, …", name: "Hotel Ejemplo", address: { road: "Passeig Jaume I", town: "Salou" } }, 41, 1)?.etiqueta)
    .toBe("Hotel Ejemplo · Passeig Jaume I · Salou");
  expect(lugarDesdeReverse({ error: "Unable to geocode" }, 41, 1)).toBeNull();
  expect(lugarDesdeReverse(null, 41, 1)).toBeNull();
});
