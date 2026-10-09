import Link from "next/link";
import { exigirRol } from "@/lib/supabase/sesion";
import { salir } from "@/app/login/actions";

const ENLACES = [
  ["/central", "Panel"], ["/central/servicios", "Servicios"], ["/central/hoja-de-ruta", "Hoja de ruta"],
  ["/central/combustible", "Combustible"], ["/central/flota", "Flota"],
] as const;

export default async function LayoutCentral({ children }: { children: React.ReactNode }) {
  const yo = await exigirRol("operador");
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4">
        <Link href="/central" className="mb-6 text-xl font-semibold text-amber-400">TransferdeLuxe</Link>
        <nav className="flex flex-1 flex-col gap-1">
          {ENLACES.map(([h, t]) => <Link key={h} href={h} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-800 hover:text-amber-300">{t}</Link>)}
        </nav>
        <p className="mb-2 text-sm text-slate-400">{yo.nombre}</p>
        <form action={salir}><button className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm hover:border-amber-400">Salir</button></form>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
