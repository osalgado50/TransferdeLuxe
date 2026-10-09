import type { EstadoServicio, TipoVehiculo } from "@/lib/dominio/tipos";

export const DOMINIO_DEMO = "@transferdeluxe.test";

export const USUARIOS_DEMO = [
  { email: `central${DOMINIO_DEMO}`, nombre: "Central Demo", rol: "operador" as const, telefono: "600 000 000", vehiculo: null },
  { email: `conductor1${DOMINIO_DEMO}`, nombre: "Marc Demo", rol: "conductor" as const, telefono: "600 000 001", vehiculo: "0001-TDL" },
  { email: `conductor2${DOMINIO_DEMO}`, nombre: "Laia Demo", rol: "conductor" as const, telefono: "600 000 002", vehiculo: "0002-TDL" },
  { email: `conductor3${DOMINIO_DEMO}`, nombre: "Jordi Demo", rol: "conductor" as const, telefono: "600 000 003", vehiculo: "0003-TDL" },
];

export const VEHICULOS_DEMO = [
  { matricula: "0001-TDL", modelo: "Mercedes Vito (demo)", plazas: 8, km: 120400 },
  { matricula: "0002-TDL", modelo: "Mercedes Vito (demo)", plazas: 8, km: 98300 },
  { matricula: "0003-TDL", modelo: "Volkswagen Caravelle (demo)", plazas: 7, km: 76100 },
];

export const LUGARES_DEMO = [
  { nombre: "Aeropuerto de Reus", tipo: "aeropuerto", lat: 41.1474, lng: 1.1672 },
  { nombre: "Aeropuerto de Barcelona T1", tipo: "aeropuerto", lat: 41.2889, lng: 2.0731 },
  { nombre: "Aeropuerto de Girona", tipo: "aeropuerto", lat: 41.901, lng: 2.7606 },
  { nombre: "Estación Camp de Tarragona", tipo: "estacion", lat: 41.191, lng: 1.27 },
  { nombre: "Barcelona Sants", tipo: "estacion", lat: 41.379, lng: 2.14 },
  { nombre: "PortAventura World", tipo: "parque", lat: 41.088, lng: 1.158 },
  { nombre: "Ferrari Land", tipo: "parque", lat: 41.0855, lng: 1.153 },
  { nombre: "Salou – Plaza Europa", tipo: "ciudad", lat: 41.076, lng: 1.14 },
  { nombre: "Cambrils – Puerto", tipo: "ciudad", lat: 41.067, lng: 1.06 },
  { nombre: "La Pineda", tipo: "ciudad", lat: 41.079, lng: 1.183 },
  { nombre: "Tarragona – Catedral", tipo: "ciudad", lat: 41.1189, lng: 1.258 },
];

export interface ServicioDemo {
  dia: -1 | 0 | 1; hora: string; origen: string; destino: string; pax: number; maletas: number;
  estado: EstadoServicio; conductor: 0 | 1 | 2 | null; tipo?: TipoVehiculo; vuelo?: string; notas?: string;
  rechazo?: string; subcontratar?: boolean; vueltaDe?: number; // índice del servicio de ida
}

// Índices de LUGARES_DEMO usados por nombre.
export const SERVICIOS_DEMO: ServicioDemo[] = [
  // Ayer: completados
  { dia: -1, hora: "08:30", origen: "Aeropuerto de Reus", destino: "Salou – Plaza Europa", pax: 3, maletas: 3, estado: "completado", conductor: 0, vuelo: "FR1234" },
  { dia: -1, hora: "10:15", origen: "Salou – Plaza Europa", destino: "PortAventura World", pax: 5, maletas: 0, estado: "completado", conductor: 1 },
  { dia: -1, hora: "12:00", origen: "Estación Camp de Tarragona", destino: "Cambrils – Puerto", pax: 2, maletas: 2, estado: "completado", conductor: 2 },
  { dia: -1, hora: "15:45", origen: "Aeropuerto de Barcelona T1", destino: "Tarragona – Catedral", pax: 4, maletas: 4, estado: "completado", conductor: 0, vuelo: "VY8120", tipo: "minivan_premium" },
  { dia: -1, hora: "18:20", origen: "PortAventura World", destino: "La Pineda", pax: 6, maletas: 0, estado: "completado", conductor: 1 },
  { dia: -1, hora: "21:00", origen: "Cambrils – Puerto", destino: "Aeropuerto de Reus", pax: 2, maletas: 2, estado: "completado", conductor: 2 },
  // Hoy
  { dia: 0, hora: "09:30", origen: "Aeropuerto de Reus", destino: "PortAventura World", pax: 4, maletas: 4, estado: "recogido", conductor: 0, vuelo: "FR5678" },
  { dia: 0, hora: "12:00", origen: "Salou – Plaza Europa", destino: "Aeropuerto de Reus", pax: 2, maletas: 2, estado: "aceptado", conductor: 1 },
  { dia: 0, hora: "16:00", origen: "Tarragona – Catedral", destino: "Aeropuerto de Barcelona T1", pax: 3, maletas: 3, estado: "asignado", conductor: 2 },
  { dia: 0, hora: "18:00", origen: "La Pineda", destino: "Estación Camp de Tarragona", pax: 2, maletas: 1, estado: "pendiente", conductor: null },
  { dia: 0, hora: "20:30", origen: "Aeropuerto de Reus", destino: "Cambrils – Puerto", pax: 5, maletas: 5, estado: "pendiente", conductor: null, rechazo: "Avería", vuelo: "W94412" },
  { dia: 0, hora: "14:00", origen: "Aeropuerto de Reus", destino: "Salou – Plaza Europa", pax: 12, maletas: 12, estado: "pendiente", conductor: null, subcontratar: true, tipo: "microbus", notas: "Grupo de 12 personas" },
  // Mañana
  { dia: 1, hora: "07:30", origen: "Salou – Plaza Europa", destino: "Aeropuerto de Girona", pax: 3, maletas: 3, estado: "asignado", conductor: 0 },
  { dia: 1, hora: "09:00", origen: "Aeropuerto de Reus", destino: "Salou – Plaza Europa", pax: 4, maletas: 4, estado: "aceptado", conductor: 1, vuelo: "FR1290" },
  { dia: 1, hora: "11:30", origen: "Barcelona Sants", destino: "Salou – Plaza Europa", pax: 2, maletas: 2, estado: "pendiente", conductor: null },
  { dia: 1, hora: "13:00", origen: "Salou – Plaza Europa", destino: "Ferrari Land", pax: 6, maletas: 0, estado: "pendiente", conductor: null },
  { dia: 1, hora: "10:00", origen: "Aeropuerto de Reus", destino: "Cambrils – Puerto", pax: 3, maletas: 3, estado: "pendiente", conductor: null, vuelo: "VY3344", notas: "Reserva con vuelta" },
  { dia: 1, hora: "19:00", origen: "Cambrils – Puerto", destino: "Aeropuerto de Reus", pax: 3, maletas: 3, estado: "pendiente", conductor: null, vueltaDe: 16 },
];

// Los dos primeros tickets llevan foto (public/demo) y usan los datos impresos en ella.
export const FOTOS_TICKET = [
  { fichero: "ticket-1.jpg", fecha: "2026-10-08", litros: 42.15, precio: 1.459, importe: 61.5 },
  { fichero: "ticket-2.jpg", fecha: "2026-10-03", litros: 38.6, precio: 1.469, importe: 56.7 },
];

// Tickets demo: por vehículo (índice de VEHICULOS_DEMO) con km crecientes con la fecha, ≤ km actuales del vehículo
// y ~6,5 L/100 km entre tickets consecutivos. Los dos con foto (ticket-1 y ticket-2) usan los datos impresos en ella.
export const TICKETS_DEMO: { veh: number; fecha: string; litros: number; precio: number; km: number; foto?: number }[] = [
  { veh: 0, fecha: "2026-09-05", litros: 45.0, precio: 1.449, km: 119000 },
  { veh: 0, fecha: "2026-09-24", litros: 33.0, precio: 1.459, km: 119500 },
  { veh: 0, fecha: "2026-10-08", litros: 42.15, precio: 1.459, km: 120150, foto: 0 },
  { veh: 1, fecha: "2026-09-02", litros: 40.0, precio: 1.439, km: 97000 },
  { veh: 1, fecha: "2026-09-18", litros: 39.0, precio: 1.449, km: 97600 },
  { veh: 1, fecha: "2026-10-03", litros: 38.6, precio: 1.469, km: 98200, foto: 1 },
  { veh: 2, fecha: "2026-09-12", litros: 41.0, precio: 1.449, km: 75000 },
  { veh: 2, fecha: "2026-09-29", litros: 45.5, precio: 1.459, km: 75700 },
];
