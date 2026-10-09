import { z } from "zod";
import type { DatosTicket } from "@/lib/lector/tipos";

const num = (min: number) => z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v), z.number().gt(min));
export const esquemaTicket = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gasolinera: z.string().trim().optional().transform((v) => v || null),
  litros: num(0), precio_litro: num(0).optional().nullable(), importe: num(0),
  tipo_combustible: z.string().trim().optional().transform((v) => v || null),
  km: z.coerce.number().int().min(0),
  foto_path: z.string().optional().nullable(),
  datos_ia: z.string().optional().nullable(),
});
export function fueCorregido(ia: DatosTicket, final: { fecha: string; litros: number; precio_litro?: number | null; importe: number }): boolean {
  return ia.fecha !== final.fecha || ia.litros !== final.litros || ia.importe !== final.importe || (ia.precio_litro ?? null) !== (final.precio_litro ?? null);
}
