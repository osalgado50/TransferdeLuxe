import { describe, expect, it } from "vitest";
import { claveFranja, decisionJornada, demandaFranja, esCorreoReserva, FRANJA_MS, reservaDeFranja, reservasEntre, type EstadoConductorDemo } from "@/lib/demo/empresaDemo";

const H = 3600e3, MIN = 60e3;
const t0 = Date.parse("2026-10-21T00:00:00+02:00");

describe("reservas que van llegando", () => {
  it("la misma franja da siempre la misma reserva (dos pasadas o dos servidores no duplican)", () => {
    for (let f = t0; f < t0 + 48 * H; f += FRANJA_MS) expect(reservaDeFranja(f)).toEqual(reservaDeFranja(f));
  });
  it("unas 8 reservas al día de media, más de día que de noche, con datos coherentes", () => {
    const semana = reservasEntre(t0, t0 + 7 * 24 * H, t0 + 10 * 24 * H);
    expect(semana.length / 7).toBeGreaterThanOrEqual(5);
    expect(semana.length / 7).toBeLessThanOrEqual(12);
    const dia = semana;
    expect(demandaFranja(t0 + 3 * H)).toBeLessThan(demandaFranja(t0 + 12 * H));
    for (const x of dia) {
      expect(x.origen).not.toBe(x.destino);
      expect(x.creadaEn).toBeLessThan(x.recogida);
      expect(x.recogida - x.creadaEn).toBeGreaterThanOrEqual(1.5 * H - MIN);
      expect(esCorreoReserva(x.cliente_email)).toBe(true);
      expect(x.cliente_email).toContain(x.clave);
      expect(x.maletas).toBeGreaterThanOrEqual(0);
      if (x.pasajeros > 3 || x.maletas > 3) expect(x.tipo_vehiculo_pedido).not.toBe("sedan");
      if (x.origen === "reus" || x.origen === "bcn") expect(x.numero_vuelo).toMatch(/^[A-Z0-9]{2,3}\d{4}$/);
      expect(x.duracion_estimada_min).toBeGreaterThan(10);
    }
  });
  it("solo aparecen las reservas ya hechas a esa hora: con el tiempo entran más", () => {
    const antes = reservasEntre(t0 + 24 * H, t0 + 72 * H, t0);
    const despues = reservasEntre(t0 + 24 * H, t0 + 72 * H, t0 + 20 * H);
    expect(despues.length).toBeGreaterThan(antes.length);
    for (const x of antes) expect(despues.map((y) => y.clave)).toContain(x.clave);
  });
  it("clave de franja en hora de Madrid (también el día del cambio de hora)", () => {
    expect(claveFranja(Date.parse("2026-10-21T14:30:00+02:00"))).toBe("20261021-1430");
    expect(claveFranja(Date.parse("2026-10-25T02:30:00+01:00"))).toBe("20261025-0230");
  });
});

describe("jornada como la haría una persona", () => {
  const id = "c1";
  const turno = { inicio: Date.parse("2026-10-21T06:00:00+02:00"), fin: Date.parse("2026-10-21T14:30:00+02:00") };
  const base: EstadoConductorDemo = { turno, abierta: null, ocupado: false, proximaRecogida: null, cerroEsteTurno: false };
  it("ficha al empezar su turno (unos minutos antes como mucho), no antes ni ya cerrado", () => {
    expect(decisionJornada(id, base, turno.inicio - 30 * MIN)).toBeNull();
    expect(decisionJornada(id, base, turno.inicio + MIN)).toBe("fichar");
    expect(decisionJornada(id, { ...base, cerroEsteTurno: true }, turno.inicio + MIN)).toBeNull();
    expect(decisionJornada(id, { ...base, turno: null }, turno.inicio + MIN)).toBeNull();
  });
  it("pausa a media jornada solo si está libre, y vuelve a los 20–30 min o si se le echa encima un servicio", () => {
    const abierta = { inicio: turno.inicio, enPausaDesde: null, pausas: 0 };
    const mitad = turno.inicio + 4 * H;
    expect(decisionJornada(id, { ...base, abierta }, mitad)).toBe("pausa");
    expect(decisionJornada(id, { ...base, abierta, ocupado: true }, mitad)).toBeNull();
    expect(decisionJornada(id, { ...base, abierta, proximaRecogida: mitad + 30 * MIN }, mitad)).toBeNull();
    expect(decisionJornada(id, { ...base, abierta: { ...abierta, pausas: 1 } }, mitad)).toBeNull();
    const enPausa = { ...abierta, enPausaDesde: mitad, pausas: 1 };
    expect(decisionJornada(id, { ...base, abierta: enPausa }, mitad + 10 * MIN)).toBeNull();
    expect(decisionJornada(id, { ...base, abierta: enPausa }, mitad + 31 * MIN)).toBe("reanudar");
    expect(decisionJornada(id, { ...base, abierta: enPausa, proximaRecogida: mitad + 40 * MIN }, mitad + 5 * MIN)).toBe("reanudar");
  });
  it("se desficha al acabar el turno, pero termina antes el servicio que lleva", () => {
    const abierta = { inicio: turno.inicio, enPausaDesde: null, pausas: 1 };
    expect(decisionJornada(id, { ...base, abierta }, turno.fin - 30 * MIN)).toBeNull();
    expect(decisionJornada(id, { ...base, abierta }, turno.fin + 11 * MIN)).toBe("desfichar");
    expect(decisionJornada(id, { ...base, abierta, ocupado: true }, turno.fin + 11 * MIN)).toBeNull();
    expect(decisionJornada(id, { ...base, abierta, proximaRecogida: turno.fin + 20 * MIN }, turno.fin + 11 * MIN)).toBeNull();
  });
});
