import { perfilActual } from "@/lib/supabase/sesion";
import { aCsv } from "@/lib/dominio/informes";
import { cargarInforme, leerFiltro, moduloInformesActivo } from "@/lib/informes/cargar";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const yo = await perfilActual();
  if (yo?.rol !== "operador") return new Response("No autorizado", { status: 401 });
  if (!(await moduloInformesActivo())) return new Response("Módulo desactivado", { status: 404 });
  const p = new URL(req.url).searchParams;
  const f = leerFiltro(Object.fromEntries(p));
  const por = p.get("por") === "conductor" ? "conductor" : "vehiculo";
  const d = await cargarInforme(f);
  if (d.error) return new Response("Error al cargar el informe", { status: 500 });
  const nombre = new Map<string, string>([...d.vehiculos.map((v) => [v.id, v.matricula] as const), ...d.conductores.map((c) => [c.id, c.nombre] as const)]);
  const filas = (por === "vehiculo" ? d.porVehiculo : d.porConductor).map((x) => [
    nombre.get(x.id) ?? "Sin asignar", x.servicios, x.pasajeros, x.km, x.sinCoordenadas, x.litros, x.gasto, x.l100, x.rechazos, x.incidencias,
  ]);
  const csv = aCsv([por === "vehiculo" ? "Vehículo" : "Conductor", "Servicios completados", "Pasajeros", "Km estimados", "Servicios sin coordenadas",
    "Litros", "Gasto (€)", "L/100 km", "Rechazos", "Incidencias"], filas);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="informe-${f.mes}-${por}.csv"` } });
}
