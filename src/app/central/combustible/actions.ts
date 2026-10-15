"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anula un ticket (mal leído, de prueba, duplicado…). No se borra nada: el ticket y su foto se quedan, pero deja de
 * contar en gasto, consumo, informes, km y historial. Si los km del vehículo salían de este ticket, vuelven al máximo
 * de lo que queda (tickets válidos y hojas de cierre); nunca se suben ni se ponen a 0.
 */
export async function anularTicket(id: string, motivo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirRol("operador");
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "Ticket no válido" };
  const m = typeof motivo === "string" ? motivo.trim().slice(0, 200) : "";
  const sb = clienteAdmin();
  const { data: t, error } = await sb.from("tickets_combustible")
    .update({ anulado: true, anulado_en: new Date().toISOString(), anulado_motivo: m || null })
    .eq("id", id).eq("anulado", false).select("vehiculo_id,km").maybeSingle();
  if (error) return { ok: false, error: "No se pudo anular el ticket" };
  if (!t) return { ok: false, error: "El ticket ya estaba anulado o no existe" };
  const { data: v } = await sb.from("vehiculos").select("km_actuales").eq("id", t.vehiculo_id).maybeSingle();
  if (v && Number(v.km_actuales) === Number(t.km)) {
    const [{ data: tk }, { data: ci }] = await Promise.all([
      sb.from("tickets_combustible").select("km").eq("vehiculo_id", t.vehiculo_id).eq("anulado", false).order("km", { ascending: false }).limit(1),
      sb.from("cierres_jornada").select("km").eq("vehiculo_id", t.vehiculo_id).not("km", "is", null).order("km", { ascending: false }).limit(1),
    ]);
    const nuevo = Math.max(Number(tk?.[0]?.km ?? 0), Number(ci?.[0]?.km ?? 0));
    if (nuevo > 0 && nuevo < Number(t.km)) {
      await sb.from("vehiculos").update({ km_actuales: nuevo }).eq("id", t.vehiculo_id).eq("km_actuales", t.km);
    }
  }
  revalidatePath("/central/combustible");
  return { ok: true };
}
