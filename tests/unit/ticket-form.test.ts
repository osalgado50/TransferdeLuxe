import { expect, test } from "vitest";
import { esquemaTicket, fueCorregido } from "@/app/conductor/ticket/esquema";
import { avisoKm, errorFechaTicket, hoyMadrid, ticketReciente } from "@/lib/dominio/ticketReglas";

test("valida ticket y convierte comas", () => {
  const r = esquemaTicket.parse({ fecha: hoyMadrid(), gasolinera: "Estación Demo", litros: "42,15", precio_litro: "1,459", importe: "61,50", tipo_combustible: "Diésel", km: "123456", foto_path: "c1/x.jpg", datos_ia: "{}" });
  expect(r.litros).toBe(42.15);
  expect(r.importe).toBe(61.5);
  expect(esquemaTicket.safeParse({ fecha: hoyMadrid(), litros: "0", importe: "10", km: "1" }).success).toBe(false);
});

test("fueCorregido compara con lo leído", () => {
  const ia = { fecha: "2026-10-09", gasolinera: null, litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" as const };
  expect(fueCorregido(ia, { fecha: "2026-10-09", litros: 42.15, precio_litro: 1.459, importe: 61.5 })).toBe(false);
  expect(fueCorregido(ia, { fecha: "2026-10-09", litros: 40, precio_litro: 1.459, importe: 61.5 })).toBe(true);
});

import { fotoPathValida } from "@/app/conductor/ticket/esquema";
const C = "11111111-2222-3333-4444-555555555555";
const U = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
test("fotoPathValida", () => {
  expect(fotoPathValida(`${C}/${U}.jpeg`, C)).toBe(true);
  expect(fotoPathValida(`${C}/${U}.jpg`, C)).toBe(true); // así las guarda la subida (extensionDe): antes se rechazaban
  expect(fotoPathValida(`${C}/${U}.png`, C)).toBe(true);
  expect(fotoPathValida(`99999999-2222-3333-4444-555555555555/${U}.jpeg`, C)).toBe(false);
  expect(fotoPathValida(`${C}/../x/${U}.jpeg`, C)).toBe(false);
  expect(fotoPathValida("", C)).toBe(false);
});
test("km vacío, fecha imposible o futura fallan", () => {
  const base = { fecha: hoyMadrid(), litros: "1", importe: "1", km: "5" };
  expect(esquemaTicket.safeParse({ ...base, km: "" }).success).toBe(false);
  expect(esquemaTicket.safeParse({ ...base, fecha: "2026-02-31" }).success).toBe(false);
  expect(esquemaTicket.safeParse({ ...base, fecha: "2999-01-01" }).success).toBe(false);
});

test("fecha del ticket: días de Madrid, límite de 60 días", () => {
  const ahora = new Date("2026-10-15T22:30:00Z"); // 00:30 del 16/10 en Madrid (en UTC aún es el 15)
  expect(hoyMadrid(ahora)).toBe("2026-10-16");
  expect(errorFechaTicket("2026-10-16", ahora)).toBeNull();
  expect(errorFechaTicket("2026-10-17", ahora)).toMatch(/futura/);
  expect(errorFechaTicket("2026-08-17", ahora)).toBeNull(); // justo 60 días
  expect(errorFechaTicket("2026-08-16", ahora)).toMatch(/del 16\/08\/2026: solo se aceptan tickets de los últimos 60 días \(desde el 17\/08\/2026\)/);
  expect(errorFechaTicket("2024-04-25", ahora)).toMatch(/60 días/);
  expect(errorFechaTicket("2026-02-31", ahora)).toMatch(/no es válida/);
  expect(errorFechaTicket("16/10/2026", ahora)).toMatch(/no es válida/);
});
test("ticket reciente: hoy y los 2 días anteriores (Madrid)", () => {
  const ahora = new Date("2026-10-15T22:30:00Z");
  expect(ticketReciente("2026-10-14", ahora)).toBe(true);
  expect(ticketReciente("2026-10-13", ahora)).toBe(false);
});
test("avisoKm: menos km que el último (reciente) es error; atrasado no; salto grande avisa", () => {
  const ahora = new Date("2026-10-15T10:00:00Z");
  const u = { matricula: "0000-TST", km: 120150 };
  expect(avisoKm("120000", "2026-10-15", u, ahora)).toMatchObject({ error: true });
  expect(avisoKm("120000", "2026-10-01", u, ahora)).toBeNull();
  expect(avisoKm("124000", "2026-10-15", u, ahora)?.texto).toMatch(/3\.850 km más que el último registro \(120\.150 km\)/);
  expect(avisoKm("", "2026-10-15", u, ahora)).toBeNull();
});
