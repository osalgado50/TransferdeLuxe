import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { clienteServidor } from "./servidor";
import { puedeConducir, type Perfil, type Rol } from "@/lib/dominio/tipos";

/**
 * Perfil del usuario de la sesión. `cache` de React: el layout y la página lo piden en el mismo render y antes eran dos
 * comprobaciones de sesión + dos selects de perfiles por cada vista (~100 ms de más en todas las páginas).
 */
export const perfilActual = cache(async (): Promise<Perfil | null> => {
  const sb = await clienteServidor();
  // getClaims verifica el JWT en local (ES256 con la clave pública del proyecto, en caché global): sin el viaje a Supabase
  // Auth de getUser (80–150 ms medidos) en cada página y acción. El perfil sigue leyéndose de la base de datos, así que
  // un conductor dado de baja (rol «baja») queda fuera igual; la base de datos vuelve a validar el JWT en cada consulta.
  const { data: c } = await sb.auth.getClaims();
  const id = c?.claims?.sub;
  if (!id) return null;
  const { data } = await sb.from("perfiles").select("*").eq("id", id).single();
  return data as Perfil | null;
});
export async function exigirRol(rol: Rol): Promise<Perfil> {
  const p = await perfilActual();
  if (!p || p.rol !== rol) redirect(`/login?destino=/${rol === "operador" ? "central" : "conductor"}`);
  return p;
}
/** Conductor o jefe que también conduce (PWA /conductor). */
export async function exigirConductor(): Promise<Perfil> {
  const p = await perfilActual();
  if (!puedeConducir(p)) redirect("/login?destino=/conductor");
  return p!;
}
