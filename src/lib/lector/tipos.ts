export interface DatosTicket {
  fecha: string | null; gasolinera: string | null; litros: number | null; precio_litro: number | null;
  importe: number | null; tipo_combustible: string | null; confianza: "alta" | "media" | "baja";
}
export interface ImagenTicket { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }
export interface LectorTicket { leer(img: ImagenTicket): Promise<DatosTicket> }
