import { exigirConductor } from "@/lib/supabase/sesion";
import CapturaTicket from "@/components/conductor/CapturaTicket";

export default async function Ticket() {
  await exigirConductor();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Ticket de combustible</h1>
      <CapturaTicket demo={process.env.NEXT_PUBLIC_MODO_DEMO === "true"} />
    </div>
  );
}
