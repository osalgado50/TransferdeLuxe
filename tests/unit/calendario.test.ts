import { describe, expect, test } from "vitest";
import { posicionarDia, celdasMes, minutosMadrid } from "@/lib/dominio/calendario";

const s = (iso: string, dur: number) => ({ fecha_hora_recogida: iso, duracion_estimada_min: dur });

describe("minutosMadrid", () => {
  test("verano y invierno", () => {
    expect(minutosMadrid("2026-10-13T08:30:00Z")).toBe(10 * 60 + 30);
    expect(minutosMadrid("2026-11-13T08:30:00Z")).toBe(9 * 60 + 30);
  });
  test("día del cambio de hora (otoño 25/10/2026): 08:00 UTC = 09:00 Madrid", () => {
    expect(minutosMadrid("2026-10-25T08:00:00Z")).toBe(9 * 60);
  });
  test("día del cambio de hora (primavera 29/03/2026): 08:00 UTC = 10:00 Madrid", () => {
    expect(minutosMadrid("2026-03-29T08:00:00Z")).toBe(10 * 60);
  });
});

describe("posicionarDia", () => {
  test("posición y alto respecto a las 06:00", () => {
    const [b] = posicionarDia([s("2026-10-13T08:00:00Z", 90)]); // 10:00 Madrid
    expect(b).toMatchObject({ top: 240, height: 90, col: 0, cols: 1, madrugada: false });
  });
  test("solapados van en columnas distintas", () => {
    const r = posicionarDia([s("2026-10-13T08:00:00Z", 60), s("2026-10-13T08:30:00Z", 60)]);
    expect(r.map((x) => [x.col, x.cols])).toEqual([[0, 2], [1, 2]]);
  });
  test("reutiliza columna libre y separa grupos", () => {
    const r = posicionarDia([s("2026-10-13T08:00:00Z", 60), s("2026-10-13T08:30:00Z", 90), s("2026-10-13T09:00:00Z", 30), s("2026-10-13T12:00:00Z", 30)]);
    expect(r.map((x) => [x.col, x.cols])).toEqual([[0, 2], [1, 2], [0, 2], [0, 1]]);
  });
  test("antes de las 06:00 es madrugada", () => {
    const [b] = posicionarDia([s("2026-10-13T02:00:00Z", 60)]); // 04:00 Madrid
    expect(b.madrugada).toBe(true);
  });
  test("recorta a medianoche y aplica mínimo de 15 min", () => {
    const r = posicionarDia([s("2026-10-13T21:30:00Z", 120), s("2026-10-13T10:00:00Z", 0)]);
    expect(r.find((x) => x.top === 23 * 60 + 30 - 360)!.height).toBe(30);
    expect(r.find((x) => x.top === 6 * 60)!.height).toBe(15);
  });
  test("día del cambio de hora", () => {
    const [b] = posicionarDia([s("2026-10-25T08:00:00Z", 60)]);
    expect(b.top).toBe(3 * 60);
  });
});

describe("celdasMes", () => {
  test("octubre 2026 empieza en jueves: 35 celdas, desde lunes 28/09", () => {
    const c = celdasMes("2026-10-17");
    expect(c).toHaveLength(35);
    expect(c[0]).toEqual({ dia: "2026-09-28", enMes: false });
    expect(c[3]).toEqual({ dia: "2026-10-01", enMes: true });
    expect(c[34]).toEqual({ dia: "2026-11-01", enMes: false });
  });
  test("febrero 2027 (lunes 1, 28 días) ocupa 28 celdas exactas", () => {
    const c = celdasMes("2027-02-10");
    expect(c).toHaveLength(28);
    expect(c.every((x) => x.enMes)).toBe(true);
  });
  test("mes que necesita 6 filas: agosto 2026", () => {
    const c = celdasMes("2026-08-01");
    expect(c).toHaveLength(42);
    expect(c[0].dia).toBe("2026-07-27");
    expect(c[41].dia).toBe("2026-09-06");
  });
});
