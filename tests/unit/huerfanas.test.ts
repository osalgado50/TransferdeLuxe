import { expect, test } from "vitest";
import { fotosHuerfanas } from "@/lib/dominio/huerfanas";

const ahora = new Date("2026-10-15T12:00:00Z");
test("solo las no referenciadas y de más de 24 h", () => {
  const objetos = [
    { path: "c1/a.jpg", creado: "2026-10-10T10:00:00Z" }, // referenciada
    { path: "c1/b.jpg", creado: "2026-10-10T10:00:00Z" }, // huérfana vieja → se borra
    { path: "c1/c.jpg", creado: "2026-10-15T01:00:00Z" }, // huérfana de hace 11 h → aún no
    { path: "c2/d.png", creado: null },                   // sin fecha → no se toca
    { path: "c2/e.png", creado: "basura" },
    { path: "c2/f.png", creado: "2026-10-14T11:59:59Z" }, // 24 h y 1 s → se borra
  ];
  expect(fotosHuerfanas(objetos, new Set(["c1/a.jpg"]), ahora)).toEqual(["c1/b.jpg", "c2/f.png"]);
});
test("sin objetos o todo referenciado: nada", () => {
  expect(fotosHuerfanas([], new Set(), ahora)).toEqual([]);
  expect(fotosHuerfanas([{ path: "x/y.jpg", creado: "2020-01-01T00:00:00Z" }], new Set(["x/y.jpg"]), ahora)).toEqual([]);
});
