import Link from "next/link";
import LogoTVL from "@/components/comun/LogoTVL";
import { exigirRol } from "@/lib/supabase/sesion";
import NavCentralMovil from "@/components/central/NavCentralMovil";
import { salir } from "@/app/login/actions";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";

const ENLACES = [
  ["/central", "Panel"], ["/central/servicios", "Servicios"], ["/central/ruta", "Hoja de ruta"],
  ["/central/combustible", "Combustible"], ["/central/flota", "Flota"],
] as const;

export default async function LayoutCentral({ children }: { children: React.ReactNode }) {
  const yo = await exigirRol("operador");
  const { data: aj } = await clienteAdmin().from("ajustes").select("modulos").eq("id", 1).maybeSingle();
  const mods = leerModulos(aj?.modulos);
  const extra: [string, string][] = [];
  if (mods.jornada) extra.push(["/central/jornadas", "Jornadas"]);
  if (mods.incidencias) extra.push(["/central/incidencias", "Incidencias"]);
  if (mods.checklist) extra.push(["/central/checklist", "Checklist"]);
  if (mods.mantenimiento) extra.push(["/central/mantenimiento", "Mantenimiento"]);
  if (mods.informes) extra.push(["/central/informes", "Informes"]);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 md:flex">
      <NavCentralMovil nombre={yo.nombre} salir={salir} extra={extra} />
      <aside className="hidden w-56 md:flex shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4">
        <Link href="/central" className="mb-6 flex flex-col items-center gap-2 text-center"><LogoTVL alto={72} prioridad /><span className="text-sm font-semibold text-marca-claro">Centro de control · TransferdeLuxe</span></Link>
        <nav className="flex flex-1 flex-col gap-1">
          {[...ENLACES, ...extra].map(([h, t]) => <Link key={h} href={h} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-800 hover:text-marca-claro">{t}</Link>)}
        </nav>
        <p className="mb-2 text-sm text-slate-400">{yo.nombre}</p>
        <form action={salir}><button className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm hover:border-marca-claro">Salir</button></form>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
    </div>
  );
}
