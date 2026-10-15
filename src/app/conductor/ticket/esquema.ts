import { z } from "zod";
import type { DatosTicket } from "@/lib/lector/tipos";
import { errorFechaTicket } from "@/lib/dominio/ticketReglas";

const num = (min: number) => z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(",", "."))) : v), z.number().gt(min));
const vacio = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);
const vacioNum = (v: unknown) => { const x = vacio(v); return typeof x === "string" ? Number(x.replace(",", ".")) : x; };
export const esquemaTicket = z.object({
  // Ni futura ni de hace más de 60 días (días de Madrid). El mensaje llega tal cual al conductor.
  fecha: z.string().trim().superRefine((f, ctx) => {
    const e = errorFechaTicket(f);
    if (e) ctx.addIssue({ code: z.ZodIssueCode.custom, message: e });
  }),
  gasolinera: z.string().trim().optional().transform((v) => v || null),
  litros: num(0), precio_litro: num(0).optional().nullable(), importe: num(0),
  tipo_combustible: z.string().trim().optional().transform((v) => v || null),
  km: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().int().min(0)),
  foto_path: z.string().optional().nullable(),
  // Datos de factura (opcionales; los rellena el OCR si salen en el ticket).
  hora: z.preprocess(vacio, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida").nullable().default(null)),
  nif_gasolinera: z.preprocess(vacio, z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8,12}$/, "CIF no válido").nullable().default(null)),
  numero_factura: z.preprocess(vacio, z.string().trim().max(40).nullable().default(null)),
  base_imponible: z.preprocess(vacioNum, z.number().min(0).nullable().default(null)),
  iva_pct: z.preprocess(vacioNum, z.number().min(0).max(30).nullable().default(null)),
  iva_importe: z.preprocess(vacioNum, z.number().min(0).nullable().default(null)),
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
  return path.startsWith(`${conductorId}/`) && new RegExp(`^${conductorId.replace(/[^0-9a-f-]/gi, "")}/[0-9a-f-]{36}\\.(jpe?g|png|webp)$`).test(path);
}
