import "server-only";
import { redirect } from "next/navigation";
import { clienteServidor } from "./servidor";
import type { Perfil, Rol } from "@/lib/dominio/tipos";

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
