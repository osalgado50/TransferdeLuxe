"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { guardarTicketConductor } from "@/lib/servicios/tickets";

export interface EstadoTicket { ok?: boolean; error?: string }

export async function guardarTicket(_: EstadoTicket, fd: FormData): Promise<EstadoTicket> {
  const yo = await exigirRol("conductor");
  const r = await guardarTicketConductor(clienteAdmin(), yo as { id: string; vehiculo_habitual_id?: string | null }, Object.fromEntries(fd));
  if (!r.ok) return { error: r.error };
  revalidatePath("/central/combustible");
  return { ok: true };
}
