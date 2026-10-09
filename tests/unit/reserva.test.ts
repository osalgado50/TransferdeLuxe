import { expect, test } from "vitest";
import { esquemaReserva, serviciosDesdeReserva } from "@/lib/reserva/esquema";

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

test("más de 8 pasajeros → subcontratar", () => {
  expect(serviciosDesdeReserva(esquemaReserva.parse({ ...base, pasajeros: "12" }), "web")[0].subcontratar).toBe(true);
});

test("sin privacidad o con campo trampa relleno → inválida", () => {
  expect(esquemaReserva.safeParse({ ...base, acepta_privacidad: undefined }).success).toBe(false);
  expect(esquemaReserva.safeParse({ ...base, web: "http://spam" }).success).toBe(false);
});
