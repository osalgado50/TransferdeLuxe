"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";

const num = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const uuidONada = z.string().uuid().or(z.literal("")).transform((v) => v || null);

const esquemaVehiculo = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  matricula: z.string().trim().min(1, "Matrícula obligatoria").transform((s) => s.toUpperCase()),
  modelo: z.string().trim().min(1, "Modelo obligatorio"),
  plazas: num(1, 19),
  estado: z.enum(["activo", "taller"]),
  km_actuales: num(0, 5_000_000),
});
const esquemaConductor = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  nombre: z.string().trim().min(1, "Nombre obligatorio"),
  telefono: z.string().trim().max(30).transform((v) => v || null),
  vehiculo_habitual_id: uuidONada,
  email: z.string().trim().email("Email no válido").optional().or(z.literal("").transform(() => undefined)),
  password: z.string().optional(),
});
const esquemaAjustes = z.object({ plazo_respuesta_min: num(5, 60), umbral_sin_senal_min: num(1, 30) });

function volver(error?: string): never {
  redirect(error ? `/central/flota?error=${encodeURIComponent(error)}` : "/central/flota?ok=1");
}
const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos no válidos";

export async function guardarVehiculo(fd: FormData) {
  await exigirRol("operador");
  const r = esquemaVehiculo.safeParse(Object.fromEntries(fd));
  if (!r.success) volver(primerError(r.error));
  const { id, ...datos } = r.data;
  const sb = clienteAdmin();
  const { error } = id ? await sb.from("vehiculos").update(datos).eq("id", id) : await sb.from("vehiculos").insert(datos);
  if (error) volver(error.code === "23505" ? "Ya existe un vehículo con esa matrícula" : error.message);
  revalidatePath("/central", "layout");
  volver();
}

export async function guardarConductor(fd: FormData) {
  await exigirRol("operador");
  const r = esquemaConductor.safeParse(Object.fromEntries(fd));
  if (!r.success) volver(primerError(r.error));
  const { id, email, password, ...datos } = r.data;
  const sb = clienteAdmin();
  if (id) {
    const { error } = await sb.from("perfiles").update(datos).eq("id", id).eq("rol", "conductor");
    if (error) volver(error.message);
  } else {
    if (!email) volver("Email obligatorio para un conductor nuevo");
    const demo = process.env.NEXT_PUBLIC_MODO_DEMO === "true";
    const clave = demo ? process.env.DEMO_PASSWORD : password;
    if (!clave || clave.length < 8) volver(demo ? "Falta DEMO_PASSWORD en el servidor" : "La contraseña debe tener al menos 8 caracteres");
    const { data, error } = await sb.auth.admin.createUser({ email: email!, password: clave!, email_confirm: true });
    if (error || !data.user) volver(error?.message ?? "No se pudo crear el usuario");
    const { error: e2 } = await sb.from("perfiles").insert({ id: data!.user.id, rol: "conductor", ...datos });
    if (e2) {
      await sb.auth.admin.deleteUser(data!.user.id);
      volver(e2.message);
    }
  }
  revalidatePath("/central", "layout");
  volver();
}

export async function guardarAjustes(fd: FormData) {
  await exigirRol("operador");
  const r = esquemaAjustes.safeParse(Object.fromEntries(fd));
  if (!r.success) volver("Plazo de respuesta 5–60 min y umbral sin señal 1–30 min");
  const { error } = await clienteAdmin().from("ajustes").update(r.data).eq("id", 1);
  if (error) volver(error.message);
  revalidatePath("/central", "layout");
  volver();
}
