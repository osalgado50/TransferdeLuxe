import { expect, test } from "vitest";
import { celdaCsv, numeroCsv, textoCsv } from "@/lib/dominio/csv";
import { aCsv } from "@/lib/dominio/informes";
import { csvRegistro } from "@/lib/dominio/jornada";

test("números con coma decimal y sin «'» aunque sean negativos", () => {
  expect(numeroCsv(7.5)).toBe("7,5");
  expect(celdaCsv(1234.56)).toBe("1234,56");
  expect(celdaCsv(-3.2)).toBe("-3,2");
  expect(celdaCsv(0)).toBe("0");
  expect(celdaCsv(null)).toBe("");
});
test("fórmulas neutralizadas en el texto", () => {
  for (const f of ["=1+1", "+34 600", "-2", "@SUMA(A1)", "\tx"]) expect(textoCsv(f).startsWith("'") || textoCsv(f).startsWith("\"'")).toBe(true);
  expect(textoCsv("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
  expect(textoCsv("Conductor Demo")).toBe("Conductor Demo");
});
test("comillas para ; \" y saltos de línea (\\n y \\r)", () => {
  expect(textoCsv("a;b")).toBe('"a;b"');
  expect(textoCsv("a\nb")).toBe('"a\nb"');
  expect(textoCsv("a\rb")).toBe('"a\rb"');
  expect(textoCsv('di"jo')).toBe('"di""jo"');
});
test("CSV de informes: coma decimal y fórmulas neutralizadas", () => {
  expect(aCsv(["Vehículo", "L/100 km"], [["=cmd", 6.25], ["0001-TDL", null]])).toBe("﻿Vehículo;L/100 km\r\n'=cmd;6,25\r\n0001-TDL;\r\n");
});
test("CSV de jornadas: nombre con fórmula neutralizado", () => {
  const csv = csvRegistro([{ conductor_id: "c1", dia: "2026-10-12", entrada: "2026-10-12T06:00:00Z", salida: "2026-10-12T15:00:00Z", pausas: 0, msPausa: 0, msTrabajado: 9 * 3600e3, porCentral: true }], () => "=Demo");
  expect(csv).toContain("'=Demo;2026-10-12;08:00;17:00;0;0,00;9,00;Sí");
});
