import { NOMBRE_TIPO } from "./capacidad";
import type { TipoVehiculo } from "./tipos";

/** Datos de un servicio que la central puede cambiar desde la ficha. */
export interface DatosEdicion {
  fecha_hora_recogida: string;
  origen_texto: string; origen_lat: number | null; origen_lng: number | null;
  destino_texto: string; destino_lat: number | null; destino_lng: number | null;
  pasajeros: number; maletas: number; tipo_vehiculo_pedido: TipoVehiculo; numero_vuelo: string | null;
  cliente_nombre: string; cliente_apellidos: string | null; cliente_email: string; cliente_telefono: string; notas: string | null;
}

const FMT = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fecha = (iso: string) => FMT.format(new Date(iso)).replace(",", "");
const breve = (t: string) => (t.length > 40 ? `${t.slice(0, 39)}…` : t);
const igual = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");

/**
 * Qué ha cambiado (para el historial y el aviso al conductor): `resumen` legible, `hora` y `trayecto` para recalcular,
 * y `afectaConductor` si cambia algo de su trabajo (hora, direcciones, pasajeros, maletas, vehículo, vuelo, cliente o notas).
 */
export function cambiosEdicion(antes: DatosEdicion, despues: DatosEdicion) {
  const resumen: string[] = [];
  const hora = Date.parse(antes.fecha_hora_recogida) !== Date.parse(despues.fecha_hora_recogida);
  if (hora) resumen.push(`Recogida ${fecha(antes.fecha_hora_recogida)} → ${fecha(despues.fecha_hora_recogida)}`);
  const origen = antes.origen_texto !== despues.origen_texto || !igual(antes.origen_lat, despues.origen_lat) || !igual(antes.origen_lng, despues.origen_lng);
  const destino = antes.destino_texto !== despues.destino_texto || !igual(antes.destino_lat, despues.destino_lat) || !igual(antes.destino_lng, despues.destino_lng);
  if (origen) resumen.push(`Recogida en ${breve(despues.origen_texto)}`);
  if (destino) resumen.push(`Destino ${breve(despues.destino_texto)}`);
  if (antes.pasajeros !== despues.pasajeros) resumen.push(`${antes.pasajeros} → ${despues.pasajeros} pax`);
  if (antes.maletas !== despues.maletas) resumen.push(`${antes.maletas} → ${despues.maletas} maletas`);
  if (antes.tipo_vehiculo_pedido !== despues.tipo_vehiculo_pedido) resumen.push(`Vehículo ${NOMBRE_TIPO[despues.tipo_vehiculo_pedido]}`);
  if (!igual(antes.numero_vuelo, despues.numero_vuelo)) resumen.push(despues.numero_vuelo ? `Vuelo ${despues.numero_vuelo}` : "Sin vuelo");
  const trabajo = resumen.length > 0;
  const cliente = antes.cliente_nombre !== despues.cliente_nombre || !igual(antes.cliente_apellidos, despues.cliente_apellidos)
    || antes.cliente_email !== despues.cliente_email || antes.cliente_telefono !== despues.cliente_telefono;
  if (cliente) resumen.push("Datos del cliente");
  const notas = !igual(antes.notas, despues.notas);
  if (notas) resumen.push("Notas");
  return { resumen, hora, trayecto: origen || destino, afectaConductor: trabajo || cliente || notas };
}
