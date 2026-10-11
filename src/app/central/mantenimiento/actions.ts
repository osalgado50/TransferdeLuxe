"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";

const fechaONada = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((v) => v || null);
const textoONada = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const esquemaPlan = z.object({
  vehiculo_id: z.string().uuid(),
  itv_fecha: fechaONada, seguro_vence: fechaONada, revision_fecha: fechaONada,
  revision_km: z.string().trim().transform((v) => (v === "" ? null : Number(v))).pipe(z.number().int().min(0).max(5_000_000).nullable()),
});
const esquemaRegistro = z.object({
  vehiculo_id: z.string().uuid("Elige un vehículo"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha obligatoria"),
  km: z.coerce.number().int().min(0).max(5_000_000),
  tipo: z.enum(["revision", "itv", "aceite", "neumaticos", "frenos", "reparacion", "otro"]),
  descripcion: textoONada(500), taller: textoONada(120),
  coste: z.string().trim().transform((v) => (v === "" ? null : Number(v.replace(",", ".")))).pipe(z.number().min(0).max(1_000_000).nullable()),
});

function volver(error?: string): never {
  redirect(error ? `/central/mantenimiento?error=${encodeURIComponent(error)}` : "/central/mantenimiento?ok=1");
}

async function exigirModulo() {
  await exigirRol("operador");
  const { data } = await clienteAdmin().from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  if (!leerModulos(data?.modulos).mantenimiento) volver("El módulo de mantenimiento está desactivado");
}

export async function guardarPlan(fd: FormData) {
  await exigirModulo();
  const r = esquemaPlan.safeParse(Object.fromEntries(fd));
  if (!r.success) volver("Algún valor no es válido");
  const { error } = await clienteAdmin().from("vehiculos_mantenimiento").upsert({ ...r.data, actualizado_en: new Date().toISOString() });
  if (error) volver("No se pudo guardar. Inténtalo de nuevo");
  revalidatePath("/central", "layout");
  volver();
}

export async function registrarMantenimiento(fd: FormData) {
  await exigirModulo();
  const r = esquemaRegistro.safeParse(Object.fromEntries(fd));
  if (!r.success) volver(r.error.issues[0]?.message ?? "Datos no válidos");
  const d = r.data;
  const { error } = await clienteAdmin().rpc("registrar_mantenimiento", {
    p_vehiculo: d.vehiculo_id, p_fecha: d.fecha, p_km: d.km, p_tipo: d.tipo, p_descripcion: d.descripcion, p_coste: d.coste, p_taller: d.taller,
  });
  if (error) volver(error.code === "23503" ? "El vehículo no existe" : "No se pudo guardar. Inténtalo de nuevo");
  revalidatePath("/central", "layout");
  volver();
}
