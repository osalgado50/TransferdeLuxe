"use server";
import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";

export async function entrar(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const sb = await clienteServidor();
  const { data, error } = await sb.auth.signInWithPassword({ email: String(fd.get("email") ?? "").trim().toLowerCase(), password: String(fd.get("password") ?? "").trim() });
  if (error || !data.user) return { error: "Email o contraseña incorrectos" };
  const { data: p } = await sb.from("perfiles").select("rol").eq("id", data.user.id).single();
  const area = p?.rol === "operador" ? "/central" : "/conductor";
  const destino = String(fd.get("destino") ?? "");
  const valido = destino === area || destino.startsWith(area + "/");
  redirect(valido ? destino : area);
}
// Solo este dispositivo: con scope global, salir en un móvil cerraba la cuenta en todos (cuentas de demo compartidas).
export async function salir() { const sb = await clienteServidor(); await sb.auth.signOut({ scope: "local" }); redirect("/login"); }
