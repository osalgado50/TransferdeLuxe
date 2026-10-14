export interface DatosTicket {
  fecha: string | null; gasolinera: string | null; litros: number | null; precio_litro: number | null;
  importe: number | null; tipo_combustible: string | null; confianza: "alta" | "media" | "baja";
  /** Datos de factura (si salen en el ticket): hora «16:55», CIF/NIF de la gasolinera, nº de factura, base, % y cuota de IVA. */
  hora?: string | null; nif?: string | null; factura?: string | null;
  base_imponible?: number | null; iva_pct?: number | null; iva_importe?: number | null;
}
export interface ImagenTicket { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }
export interface LectorTicket { leer(img: ImagenTicket): Promise<DatosTicket> }
