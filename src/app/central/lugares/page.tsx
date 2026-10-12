import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import GestionLugaresEmpresa from "@/components/central/GestionLugaresEmpresa";
import type { LugarEmpresa } from "@/lib/dominio/lugaresEmpresa";

export const metadata = { title: "Lugares de la empresa · TransferdeLuxe" };

export default async function LugaresEmpresa() {
  await exigirRol("operador");
  const { data, error } = await clienteAdmin().from("lugares_empresa").select("id, nombre, direccion, lat, lng, notas, telefono").order("nombre");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-marca-claro">Lugares de la empresa</h1>
      <p className="text-sm text-slate-400">
        Clientes y sitios habituales con su dirección exacta. En «Nuevo servicio» salen los primeros (🏢) al escribir su nombre,
        sin acentos ni mayúsculas. Son privados: no aparecen en la reserva pública.
      </p>
      {error && <p role="alert" className="rounded bg-amber-900/50 p-2 text-sm text-amber-200">No se pudieron cargar los lugares.</p>}
      <GestionLugaresEmpresa lugares={(data ?? []) as LugarEmpresa[]} />
    </div>
  );
}
