import FormularioReserva from "@/app/reservar/FormularioReserva";
import { crearServicioManual } from "@/app/central/actions";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import type { Favorito } from "@/lib/dominio/favoritos";

export const metadata = { title: "Nuevo servicio · TransferdeLuxe" };

export default async function NuevoServicio() {
  await exigirRol("operador");
  const { data, error } = await clienteAdmin().from("favoritos").select("*").order("nombre");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Nuevo servicio</h1>
      {error && <p role="alert" className="rounded bg-amber-900/50 p-2 text-sm text-amber-200">No se pudieron cargar los favoritos.</p>}
      <FormularioReserva accion={crearServicioManual} modo="central" favoritos={(data ?? []) as Favorito[]} />
    </div>
  );
}
