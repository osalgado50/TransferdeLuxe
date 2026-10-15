import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { motivoSubcontratar, leerMotivoSubcontratar } from "@/lib/dominio/capacidad";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";

// Reloj fijo: las fechas de los ejemplos (20/10/2026…) no pueden «caducar» con la regla de «nada en el pasado».
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-10T10:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

const base = {
  origen_texto: "Aeropuerto de Reus", origen_lat: "41.1474", origen_lng: "1.1672",
  destino_texto: "Salou centro", destino_lat: "41.0763", destino_lng: "1.1416",
  fecha: "2026-10-20", hora: "10:30", pasajeros: "4", maletas: "3", tipo_vehiculo_pedido: "minivan",
  numero_vuelo: "VY1234", cliente_nombre: "Lucía", cliente_apellidos: "Demo", cliente_email: "lucia@ejemplo.test",
  cliente_telefono: "600000001", notas: "", acepta_privacidad: "on", web: "",
};

test("reserva solo ida", () => {
  const r = esquemaReserva.parse(base);
  const s = serviciosDesdeReserva(r, "web");
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ pasajeros: 4, origen_pedido: "web", subcontratar: false });
  expect(s[0].fecha_hora_recogida).toBe("2026-10-20T08:30:00.000Z"); // 10:30 Madrid (CEST)
  expect(s[0].duracion_estimada_min).toBeGreaterThanOrEqual(15);
});

test("con vuelta crea dos servicios; vuelta sin fecha es inválida", () => {
  const conVuelta = { ...base, con_vuelta: "on", vuelta_origen_texto: "Salou centro", vuelta_origen_lat: "41.0763", vuelta_origen_lng: "1.1416",
    vuelta_destino_texto: "Aeropuerto de Reus", vuelta_destino_lat: "41.1474", vuelta_destino_lng: "1.1672", vuelta_fecha: "2026-10-27", vuelta_hora: "18:00" };
  expect(serviciosDesdeReserva(esquemaReserva.parse(conVuelta), "web")).toHaveLength(2);
  expect(esquemaReserva.safeParse({ ...conVuelta, vuelta_fecha: "" }).success).toBe(false);
});

test("tipo que no cabe → error en tipo_vehiculo_pedido", () => {
  const r = esquemaReserva.safeParse({ ...base, tipo_vehiculo_pedido: "sedan", pasajeros: "5", maletas: "6" });
  expect(r.success ? [] : r.error.flatten().fieldErrors.tipo_vehiculo_pedido).toEqual([expect.stringContaining("elige MiniVan (7 pax)")]);
  expect(esquemaReserva.safeParse({ ...base, tipo_vehiculo_pedido: "minibus", pasajeros: "19", maletas: "19" }).success).toBe(true);
});

test("motivo de subcontratación: constructor y lector coinciden", () => {
  expect(leerMotivoSubcontratar(motivoSubcontratar(5, 6))).toBe("ningún vehículo propio cabe");
  expect(leerMotivoSubcontratar("nuevo")).toBeNull();
});

test("12 pax en microbús sin vehículo propio → válido y subcontratar", async () => {
  const r = esquemaReserva.safeParse({ ...base, tipo_vehiculo_pedido: "microbus", pasajeros: "12", maletas: "12" });
  expect(r.success).toBe(true);
  const filas: { subcontratar: boolean }[][] = [];
  const sb = { from(t: string) { const q: Record<string, unknown> = {};
    q.select = () => (t === "vehiculos" ? Promise.resolve({ data: [{ plazas: 8, maletas: 8, estado: "activo" }], error: null })
      : t === "ajustes" ? { single: () => Promise.resolve({ data: { plazo_respuesta_min: 15 }, error: null }) } : Promise.resolve({ data: [{ id: "A" }], error: null }));
    q.insert = (a: never) => { if (t === "servicios") { filas.push(a); return q; } return Promise.resolve({ error: null }); };
    return q; } } as never;
  await crearServicios(sb, serviciosDesdeReserva(r.success ? r.data : (null as never), "web"));
  expect(filas[0][0].subcontratar).toBe(true);
});

test("error al leer la flota se propaga y no inserta", async () => {
  let insertado = false;
  const sb = { from(t: string) { const q: Record<string, unknown> = {};
    q.select = () => (t === "vehiculos" ? Promise.resolve({ data: null, error: { message: "flota caída" } })
      : { single: () => Promise.resolve({ data: { plazo_respuesta_min: 15 }, error: null }) });
    q.insert = () => { insertado = true; return q; };
    return q; } } as never;
  await expect(crearServicios(sb, [nuevo])).rejects.toThrow("flota caída");
  expect(insertado).toBe(false);
});

test("crearServicios marca subcontratar si ningún vehículo propio cabe, con motivo", async () => {
  const filas: { subcontratar: boolean; ultima_incidencia: string }[][] = [];
  const mk = (flota: unknown[]) => ({
    from(t: string) {
      const q: Record<string, unknown> = {};
      q.select = () => (t === "vehiculos" ? Promise.resolve({ data: flota, error: null })
        : t === "ajustes" ? { single: () => Promise.resolve({ data: { plazo_respuesta_min: 15 }, error: null }) }
        : Promise.resolve({ data: [{ id: "A" }], error: null }));
      q.insert = (a: never) => { if (t === "servicios") { filas.push(a); return q; } return Promise.resolve({ error: null }); };
      return q;
    },
  }) as never;
  const grande = { ...nuevo, pasajeros: 5, maletas: 6 };
  await crearServicios(mk([{ plazas: 8, maletas: 2, estado: "activo" }]), [grande]);
  expect(filas[0][0]).toMatchObject({ subcontratar: true, ultima_incidencia: "subcontratar: 5 pax y 6 maletas, ningún vehículo propio cabe" });
  await crearServicios(mk([{ plazas: 8, maletas: 8, estado: "activo" }]), [grande]);
  expect(filas[1][0]).toMatchObject({ subcontratar: false, ultima_incidencia: "nuevo" });
});

test("sin privacidad o con campo trampa relleno → inválida", () => {
  expect(esquemaReserva.safeParse({ ...base, acepta_privacidad: undefined }).success).toBe(false);
  expect(esquemaReserva.safeParse({ ...base, web: "http://spam" }).success).toBe(false);
});

test("fechas y horas imposibles → error en el campo correcto", () => {
  const campo = (o: object) => {
    const r = esquemaReserva.safeParse({ ...base, ...o });
    return r.success ? [] : Object.keys(r.error.flatten().fieldErrors);
  };
  expect(campo({ fecha: "2026-13-45" })).toContain("fecha");
  expect(campo({ hora: "25:99" })).toContain("hora");
  const v = { con_vuelta: "on", vuelta_origen_texto: "Salou", vuelta_destino_texto: "Reus", vuelta_hora: "18:00" };
  expect(campo({ ...v, vuelta_fecha: "abc" })).toContain("vuelta_fecha");
});

function falso(errorEn?: string) {
  const llamadas: { op: string; tabla: string; arg?: unknown; id?: unknown }[] = [];
  const sb = {
    from(tabla: string) {
      const q: Record<string, unknown> = {};
      let op = "";
      let arg: unknown;
      const fin = (extra?: { id?: unknown }) => {
        llamadas.push({ op, tabla, arg, ...extra });
        return Promise.resolve({ data: null, error: errorEn === op + ":" + tabla ? { message: "boom" } : null });
      };
      q.select = () => (tabla === "vehiculos" ? Promise.resolve({ data: [{ plazas: 8, maletas: 8, estado: "activo" }], error: null }) : op === "insert" ? Promise.resolve({ data: [{ id: "A" }, { id: "B" }], error: null }) : { single: () => Promise.resolve({ data: { plazo_respuesta_min: 15 }, error: null }) });
      q.insert = (a: unknown) => { op = "insert"; arg = a; return tabla === "servicios" ? q : fin(); };
      q.update = (a: unknown) => { op = "update"; arg = a; return { eq: (_: string, id: unknown) => fin({ id }) }; };
      q.delete = () => { op = "delete"; return { in: (_: string, ids: unknown) => { arg = ids; return fin(); } }; };
      return q;
    },
  };
  return { sb: sb as never, llamadas };
}

const nuevo = (esquemaReserva.parse(base), serviciosDesdeReserva(esquemaReserva.parse(base), "web")[0]);

test("crearServicios enlaza ida y vuelta de forma cruzada", async () => {
  const { sb, llamadas } = falso();
  expect(await crearServicios(sb, [nuevo, nuevo])).toEqual(["A", "B"]);
  const up = llamadas.filter((l) => l.op === "update");
  expect(up).toEqual([
    expect.objectContaining({ arg: { servicio_vuelta_id: "B" }, id: "A" }),
    expect.objectContaining({ arg: { servicio_vuelta_id: "A" }, id: "B" }),
  ]);
});

test("error al enlazar se propaga y borra lo insertado", async () => {
  const { sb, llamadas } = falso("update:servicios");
  await expect(crearServicios(sb, [nuevo, nuevo])).rejects.toThrow("boom");
  expect(llamadas.find((l) => l.op === "delete")?.arg).toEqual(["A", "B"]);
});

test("nº de vuelo: normaliza, rechaza inválidos y acepta vacío", () => {
  const r = esquemaReserva.safeParse({ ...base, numero_vuelo: "fr 1234" });
  expect(r.success && r.data.numero_vuelo).toBe("FR1234");
  expect(esquemaReserva.safeParse({ ...base, numero_vuelo: "hola" }).success).toBe(false);
  const v = esquemaReserva.safeParse({ ...base, numero_vuelo: "" });
  expect(v.success && v.data.numero_vuelo).toBeNull();
});

test("no se aceptan recogidas en el pasado (margen de 1 h) ni vueltas antes de la ida", () => {
  const campos = (x: object) => { const r = esquemaReserva.safeParse({ ...base, ...x }); return r.success ? [] : Object.keys(r.error.flatten().fieldErrors); };
  expect(campos({ fecha: "2026-10-09", hora: "10:30" })).toContain("fecha");
  expect(campos({ fecha: "2026-10-10", hora: "11:30" })).toEqual([]); // 11:30 de Madrid = 09:30Z: 30 min atrás, dentro del margen
  expect(campos({ fecha: "2026-10-10", hora: "10:30" })).toContain("fecha"); // 08:30Z: 1 h 30 min atrás
  const vuelta = { con_vuelta: "on", vuelta_origen_texto: "Salou", vuelta_destino_texto: "Reus", vuelta_fecha: "2026-10-20", vuelta_hora: "09:00" };
  expect(campos(vuelta)).toContain("vuelta_fecha");
  expect(campos({ ...vuelta, vuelta_hora: "18:00" })).toEqual([]);
});
