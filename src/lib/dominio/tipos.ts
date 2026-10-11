export type Rol = "operador" | "conductor";
export type EstadoServicio =
  | "pendiente" | "asignado" | "aceptado" | "en_camino" | "recogido" | "completado" | "cancelado" | "subcontratado";
export type TipoVehiculo = "sedan" | "minivan" | "minivan_premium" | "microbus" | "minibus";
export interface Punto { lat: number; lng: number }

export interface Servicio {
  id: string;
  cliente_nombre: string; cliente_apellidos: string; cliente_email: string; cliente_telefono: string;
  origen_texto: string; origen_lat: number | null; origen_lng: number | null;
  destino_texto: string; destino_lat: number | null; destino_lng: number | null;
  fecha_hora_recogida: string; pasajeros: number; maletas: number;
  tipo_vehiculo_pedido: TipoVehiculo; numero_vuelo: string | null; notas: string | null;
  origen_pedido: "web" | "manual"; servicio_vuelta_id: string | null;
  conductor_id: string | null; vehiculo_id: string | null; estado: EstadoServicio;
  asignado_en: string | null; plazo_respuesta_min: number; duracion_estimada_min: number;
  subcontratar: boolean; ultima_incidencia: string | null; incidencia_vista: boolean; creado_en: string;
  hora_llegada_real?: string | null;
}
export interface Vehiculo { id: string; matricula: string; modelo: string; plazas: number; maletas: number; estado: "activo" | "taller"; km_actuales: number }
export interface Perfil { id: string; rol: Rol; nombre: string; telefono: string | null; vehiculo_habitual_id: string | null }
export interface PosicionActual { conductor_id: string; lat: number; lng: number; velocidad: number | null; en_servicio: boolean; registrado_en: string }
export interface TicketCombustible {
  id: string; conductor_id: string; vehiculo_id: string; fecha: string; gasolinera: string | null;
  litros: number; precio_litro: number | null; importe: number; tipo_combustible: string | null; km: number;
  foto_path: string | null; corregido: boolean; creado_en: string;
}
