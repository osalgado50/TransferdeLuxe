// Consulta automática de vuelos (preparada, desactivada sin clave). Solo servidor.
export type InfoLlegada = {
  programada: Date | null;
  /** Mejor dato disponible de llegada real/estimada (pista > revisada). */
  real: Date | null;
  estado: string | null;
};

export interface ProveedorVuelos {
  nombre: string;
  /** fecha = día local del vuelo (YYYY-MM-DD). null si no hay datos. Nunca lanza. */
  consultarLlegada(codigo: string, fecha: string): Promise<InfoLlegada | null>;
}
