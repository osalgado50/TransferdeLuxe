import { z } from "zod";
import type { DatosTicket } from "@/lib/lector/tipos";

const num = (min: number) => z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v), z.number().gt(min));
export const esquemaTicket = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((f) => {
    const t = new Date(`${f}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === f && t.getTime() <= Date.now() + 86400e3;
  }, "Fecha no válida"),
  gasolinera: z.string().trim().optional().transform((v) => v || null),
  litros: num(0), precio_litro: num(0).optional().nullable(), importe: num(0),
  tipo_combustible: z.string().trim().optional().transform((v) => v || null),
  km: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().int().min(0)),
  foto_path: z.string().optional().nullable(),
  datos_ia: z.string().optional().nullable(),
});
export function fueCorregido(ia: DatosTicket, final: { fecha: string; litros: number; precio_litro?: number | null; importe: number }): boolean {
  return ia.fecha !== final.fecha || ia.litros !== final.litros || ia.importe !== final.importe || (ia.precio_litro ?? null) !== (final.precio_litro ?? null);
}

export const esquemaDatosTicket = z.object({
  fecha: z.string().nullable(), gasolinera: z.string().nullable(), litros: z.number().nullable(), precio_litro: z.number().nullable(),
  importe: z.number().nullable(), tipo_combustible: z.string().nullable(), confianza: z.enum(["alta", "media", "baja"]),
});
export function fotoPathValida(path: string, conductorId: string): boolean {
  return path.startsWith(`${conductorId}/`) && new RegExp(`^${conductorId.replace(/[^0-9a-f-]/gi, "")}/[0-9a-f-]{36}\\.(jpeg|png|webp)$`).test(path);
}
