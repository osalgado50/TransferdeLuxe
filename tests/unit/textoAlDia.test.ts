import { expect, test } from "vitest";
import { duracionMin, textoAlDia } from "@/lib/dominio/actividad";

const en = "2026-10-14T06:15:00Z"; // 08:15 en Madrid
const min = (n: number) => Date.parse(en) + n * 60_000;

test("la alerta de jornada sin iniciar sigue contando: creada «hace 15 min» a las 08:15, vista a las 12:27", () => {
  const t = "⏰ Oscar Demo no ha iniciado la jornada: su turno empezó a las 08:00 (hace 15 min)";
  expect(textoAlDia(t, en, min(252))).toBe("⏰ Oscar Demo no ha iniciado la jornada: su turno empezó a las 08:00 (hace 4 h 27 min)");
  expect(textoAlDia(t, en, min(0))).toBe(t);
  expect(textoAlDia(t, en, min(30))).toMatch(/\(hace 45 min\)$/);
});
test("fin de turno: los minutos después del turno también avanzan", () => {
  expect(textoAlDia("🕒 Marc sigue en servicio 35 min después de su turno (fin 15:00) · vuelta a la base ≈ 15:50", en, min(30)))
    .toBe("🕒 Marc sigue en servicio 1 h 5 min después de su turno (fin 15:00) · vuelta a la base ≈ 15:50");
});
test("textos sin tiempo, fecha rara o reloj atrasado: no cambian", () => {
  expect(textoAlDia("CARGA lejos del punto", en, min(60))).toBe("CARGA lejos del punto");
  expect(textoAlDia("(hace 15 min)", "x", min(60))).toBe("(hace 15 min)");
  expect(textoAlDia("(hace 15 min)", en, min(-5))).toBe("(hace 15 min)");
  expect(duracionMin(60)).toBe("1 h");
});
