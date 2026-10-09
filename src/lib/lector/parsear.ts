import { z } from "zod";
import type { DatosTicket } from "./tipos";

const num = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number().positive()).nullable().catch(null);
const texto = z.string().trim().min(1).nullable().catch(null);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s))).nullable().catch(null);

const Esquema = z.object({
  fecha: fecha.default(null), gasolinera: texto.default(null), litros: num.default(null), precio_litro: num.default(null),
  importe: num.default(null), tipo_combustible: texto.default(null),
  confianza: z.enum(["alta", "media", "baja"]).catch("baja").default("baja"),
});

const VACIO: DatosTicket = { fecha: null, gasolinera: null, litros: null, precio_litro: null, importe: null, tipo_combustible: null, confianza: "baja" };

export function parsearRespuesta(textoModelo: string): DatosTicket {
  const m = textoModelo.match(/\{[\s\S]*\}/);
  if (!m) return { ...VACIO };
  try { return Esquema.parse(JSON.parse(m[0])); } catch { return { ...VACIO }; }
}

export function esCoherente(d: DatosTicket): boolean {
  if (d.litros == null || d.precio_litro == null || d.importe == null) return true;
  const calc = d.litros * d.precio_litro;
  return Math.abs(calc - d.importe) <= Math.max(0.1, d.importe * 0.02);
}
