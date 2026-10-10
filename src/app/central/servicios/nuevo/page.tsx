import FormularioReserva from "@/app/reservar/FormularioReserva";
import { crearServicioManual } from "@/app/central/actions";

export const metadata = { title: "Nuevo servicio · TransferdeLuxe" };

export default function NuevoServicio() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Nuevo servicio</h1>
      <FormularioReserva accion={crearServicioManual} modo="central" />
    </div>
  );
}
