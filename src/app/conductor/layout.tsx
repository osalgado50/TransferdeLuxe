import Link from "next/link";
import { leerModulos } from "@/lib/dominio/modulos";
import LogoTVL from "@/components/comun/LogoTVL";
import type { Metadata, Viewport } from "next";
import { exigirConductor } from "@/lib/supabase/sesion";
import InterruptorServicio from "@/components/conductor/InterruptorServicio";
import BotonSalir from "@/components/conductor/BotonSalir";
import TarjetaServicioNuevo, { type ServicioNuevo } from "@/components/conductor/TarjetaServicioNuevo";
import { clienteServidor } from "@/lib/supabase/servidor";
import RegistroSW from "@/components/conductor/RegistroSW";
import DrenajeCola from "@/components/conductor/DrenajeCola";

export const metadata: Metadata = {
  title: "TVL VIP Transfers · Conductor",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "TVL Conductor", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#0b1b2e", width: "device-width", initialScale: 1 };

const NAV = [["/conductor", "Hoy"], ["/conductor/ticket", "Ticket"], ["/conductor/historial", "Historial"]] as const;

export default async function LayoutConductor({ children }: { children: React.ReactNode }) {
  const yo = await exigirConductor();
  const sb = await clienteServidor();
  const { data: aj } = await sb.from("ajustes").select("modulos").maybeSingle();
  const { data: nuevos } = await sb.from("servicios")
    .select("id,estado,conductor_id,asignado_en,plazo_respuesta_min,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas,numero_vuelo,notas")
    .eq("conductor_id", yo.id).eq("estado", "asignado");
  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-200">
      <RegistroSW />
      <DrenajeCola conductorId={yo.id} />
      <TarjetaServicioNuevo iniciales={(nuevos ?? []) as ServicioNuevo[]} yo={yo.id} vuelos={leerModulos(aj?.modulos).vuelos} />
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3"><LogoTVL alto={48} prioridad /><div><p className="text-xs text-slate-400">Conductor · TransferdeLuxe</p><p className="text-lg font-semibold text-marca-claro">{yo.nombre}</p>{yo.rol === "operador" && <Link href="/central" className="text-xs text-marca-claro underline">Volver a la central</Link>}</div></div>
        <InterruptorServicio conductorId={yo.id} />
      </header>
      <main className="p-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-800 bg-slate-900">
        {NAV.map(([h, t]) => <Link key={h} href={h} className="flex min-h-14 items-center justify-center text-base font-medium hover:text-marca-claro">{t}</Link>)}
        <BotonSalir conductorId={yo.id} />
      </nav>
    </div>
  );
}
