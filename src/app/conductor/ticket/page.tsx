import { exigirConductor } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import CapturaTicket, { type UltimoKm } from "@/components/conductor/CapturaTicket";

export default async function Ticket() {
  const yo = await exigirConductor();
  // Últimos km del coche del conductor: pista bajo el campo y aviso antes de guardar (el servidor valida igual).
  let ultimo: UltimoKm | null = null;
  if (yo.vehiculo_habitual_id) {
    const { data } = await clienteAdmin().from("vehiculos").select("matricula,km_actuales").eq("id", yo.vehiculo_habitual_id).maybeSingle();
    if (data) ultimo = { matricula: data.matricula as string, km: Number(data.km_actuales) || 0 };
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Ticket de combustible</h1>
      <CapturaTicket demo={process.env.NEXT_PUBLIC_MODO_DEMO === "true"} ultimo={ultimo} />
    </div>
  );
}
