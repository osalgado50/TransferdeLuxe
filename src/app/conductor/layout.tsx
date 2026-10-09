import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { exigirRol } from "@/lib/supabase/sesion";
import InterruptorServicio from "@/components/conductor/InterruptorServicio";
import BotonSalir from "@/components/conductor/BotonSalir";
import RegistroSW from "@/components/conductor/RegistroSW";

export const metadata: Metadata = {
  title: "TransferdeLuxe Conductor",
  icons: { apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "TdL Conductor", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0f172a", width: "device-width", initialScale: 1 };

const NAV = [["/conductor", "Hoy"], ["/conductor/ticket", "Ticket"], ["/conductor/historial", "Historial"]] as const;

export default async function LayoutConductor({ children }: { children: React.ReactNode }) {
  const yo = await exigirRol("conductor");
  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-200">
      <RegistroSW />
      <header className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="pt-2"><p className="text-xs text-slate-400">Conductor</p><p className="text-lg font-semibold text-amber-400">{yo.nombre}</p></div>
        <InterruptorServicio conductorId={yo.id} />
      </header>
      <main className="p-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-800 bg-slate-900">
        {NAV.map(([h, t]) => <Link key={h} href={h} className="flex min-h-14 items-center justify-center text-base font-medium hover:text-amber-300">{t}</Link>)}
        <BotonSalir conductorId={yo.id} />
      </nav>
    </div>
  );
}
