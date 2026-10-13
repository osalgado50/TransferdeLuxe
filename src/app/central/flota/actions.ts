"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { modulosDesdeFormulario } from "@/lib/dominio/modulos";

const num = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const uuidONada = z.string().uuid().or(z.literal("")).transform((v) => v || null);

const esquemaVehiculo = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  matricula: z.string().trim().min(1, "Matrícula obligatoria").transform((s) => s.toUpperCase()),
  modelo: z.string().trim().min(1, "Modelo obligatorio"),
  plazas: num(1, 19),
  maletas: z.preprocess((v) => (v === "" || v == null ? undefined : v), num(0, 30).optional()),
  estado: z.enum(["activo", "taller"]),
  km_actuales: num(0, 5_000_000),
}).transform((d) => ({ ...d, maletas: d.maletas ?? d.plazas }));
const esquemaConductor = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  nombre: z.string().trim().min(1, "Nombre obligatorio"),
  telefono: z.string().trim().max(30).transform((v) => v || null),
  vehiculo_habitual_id: uuidONada,
  email: z.string().trim().email("Email no válido").optional().or(z.literal("").transform(() => undefined)),
  password: z.string().optional(),
});
const esquemaAjustes = z.object({ plazo_respuesta_min: num(5, 60), umbral_sin_senal_min: num(1, 30), margen_equipaje_min: num(0, 180).optional(),
  margen_minimo_min: num(0, 120).optional() });

/** Traduce errores de Supabase/Postgres a mensajes en español sin exponer detalles internos. */
function amigable(e: { code?: string; message?: string }): string {
  switch (e.code) {
    case "23505": return "Ya existe un registro con esos datos";
    case "23503": return "El vehículo indicado no existe o está en uso";
    case "23514": case "22P02": case "22003": return "Algún valor no es válido";
    case "42501": return "No tienes permiso para esta operación";
  }
  if (/already|registered|exists/i.test(e.message ?? "")) return "Ya existe un usuario con ese email";
  return "No se pudo guardar. Inténtalo de nuevo";
}

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
  if (id) {
    const { data, error } = await sb.from("vehiculos").update(datos).eq("id", id).select("id");
    if (error) volver(error.code === "23505" ? "Ya existe un vehículo con esa matrícula" : amigable(error));
    if (!data?.length) volver("El vehículo ya no existe");
  } else {
    const { error } = await sb.from("vehiculos").insert(datos);
    if (error) volver(error.code === "23505" ? "Ya existe un vehículo con esa matrícula" : amigable(error));
  }
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
    const { data, error } = await sb.from("perfiles").update(datos).eq("id", id).eq("rol", "conductor").select("id");
    if (error) volver(amigable(error));
    if (!data?.length) volver("El conductor ya no existe");
  } else {
    if (!email) volver("Email obligatorio para un conductor nuevo");
    const demo = process.env.NEXT_PUBLIC_MODO_DEMO === "true";
    if (demo && !email!.toLowerCase().endsWith("@transferdeluxe.test")) volver("En modo demo el email debe terminar en @transferdeluxe.test");
    const clave = demo ? process.env.DEMO_PASSWORD : password;
    if (!clave || clave.length < 8) volver(demo ? "Falta DEMO_PASSWORD en el servidor" : "La contraseña debe tener al menos 8 caracteres");
    const { data, error } = await sb.auth.admin.createUser({ email: email!, password: clave!, email_confirm: true });
    if (error || !data.user) volver(error ? amigable(error) : "No se pudo crear el usuario");
    const { error: e2 } = await sb.from("perfiles").insert({ id: data!.user.id, rol: "conductor", ...datos });
    if (e2) {
      await sb.auth.admin.deleteUser(data!.user.id);
      volver(amigable(e2));
    }
  }
  revalidatePath("/central", "layout");
  volver();
}

const esquemaOperador = z.object({ id: z.string().uuid(), conduce: z.literal("on").optional(), vehiculo_habitual_id: uuidONada });

/** Usuario de la central: «También conduce» y vehículo habitual (el jefe que hace servicios). */
export async function guardarOperador(fd: FormData) {
  await exigirRol("operador");
  const r = esquemaOperador.safeParse(Object.fromEntries(fd));
  if (!r.success) volver(primerError(r.error));
  const { id, conduce, vehiculo_habitual_id } = r.data;
  const { data, error } = await clienteAdmin().from("perfiles").update({ conduce: conduce === "on", vehiculo_habitual_id }).eq("id", id).eq("rol", "operador").select("id");
  if (error) volver(amigable(error));
  if (!data?.length) volver("El usuario ya no existe");
  revalidatePath("/central", "layout");
  volver();
}

export async function guardarAjustes(fd: FormData) {
  await exigirRol("operador");
  const r = esquemaAjustes.safeParse(Object.fromEntries(fd));
  if (!r.success) volver("Plazo de respuesta 5–60 min, umbral sin señal 1–30 min, margen mínimo 0–120 min y margen de equipaje 0–180 min");
  const { error } = await clienteAdmin().from("ajustes").update(r.data).eq("id", 1);
  if (error) volver(amigable(error));
  revalidatePath("/central", "layout");
  volver();
}

export async function guardarModulos(fd: FormData) {
  await exigirRol("operador");
  const { error } = await clienteAdmin().from("ajustes").update({ modulos: modulosDesdeFormulario(fd.entries() as Iterable<[string, unknown]>) }).eq("id", 1);
  if (error) volver(amigable(error));
  revalidatePath("/", "layout");
  volver();
}
