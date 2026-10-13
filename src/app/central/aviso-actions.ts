"use server";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { datosAviso, registrarAvisoCliente } from "@/lib/servicios/seguimiento";
import type { CanalAviso, TipoAviso } from "@/lib/dominio/avisoCliente";

/** Central: datos para redactar el aviso al cliente (enlace de seguimiento, conductor asignado, vehículo). */
export async function datosAvisoCentral(servicioId: string) {
  const yo = await exigirRol("operador");
  const r = await datosAviso(clienteAdmin(), { id: yo.id, rol: yo.rol, central: true }, servicioId);
  return r.ok ? { ok: true as const, ruta: r.ruta, conductor: r.conductor, modelo: r.modelo, matricula: r.matricula } : { ok: false as const, error: r.error };
}

/** Central: anota el aviso (evento aviso_cliente) tras abrir WhatsApp/SMS. */
export async function avisoClienteCentral(p: { idAccion: string; servicioId: string; tipo: TipoAviso; canal: CanalAviso }) {
  const yo = await exigirRol("operador");
  const r = await registrarAvisoCliente(clienteAdmin(), { id: yo.id, rol: yo.rol, central: true }, p);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}
