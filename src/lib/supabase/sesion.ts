import "server-only";
import { redirect } from "next/navigation";
import { clienteServidor } from "./servidor";
import { puedeConducir, type Perfil, type Rol } from "@/lib/dominio/tipos";

export async function perfilActual(): Promise<Perfil | null> {
  const sb = await clienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("perfiles").select("*").eq("id", user.id).single();
  return data as Perfil | null;
}
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
