import FormularioReserva from "@/app/reservar/FormularioReserva";
import { crearServicioManual } from "@/app/central/actions";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";
import type { Favorito } from "@/lib/dominio/favoritos";
import type { LugarEmpresa } from "@/lib/dominio/lugaresEmpresa";

export const metadata = { title: "Nuevo servicio · TransferdeLuxe" };

export default async function NuevoServicio() {
  await exigirRol("operador");
  const sb = clienteAdmin();
  const [{ data, error }, { data: aj }, { data: lugares }] = await Promise.all([
    sb.from("favoritos").select("*").order("nombre"), sb.from("ajustes").select("modulos").maybeSingle(),
    sb.from("lugares_empresa").select("id, nombre, direccion, lat, lng, notas, telefono").order("nombre"),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Nuevo servicio</h1>
      {error && <p role="alert" className="rounded bg-amber-900/50 p-2 text-sm text-amber-200">No se pudieron cargar los favoritos.</p>}
      <FormularioReserva accion={crearServicioManual} modo="central" favoritos={(data ?? []) as Favorito[]} lugaresEmpresa={(lugares ?? []) as LugarEmpresa[]} vuelos={leerModulos(aj?.modulos).vuelos} />
    </div>
  );
}
