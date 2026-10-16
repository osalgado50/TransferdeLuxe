import Link from "next/link";
import LogoMarca from "@/components/comun/LogoMarca";

import { clienteAdmin } from "@/lib/supabase/admin";
import { leerModulos } from "@/lib/dominio/modulos";

// Página pública sin sesión: HTML estático cacheable por la CDN, regenerado cada 5 min (módulos activos).
export const revalidate = 300;
import PieLegal from "@/components/legal/PieLegal";
import FormularioReserva from "./FormularioReserva";

export const metadata = { title: "Reservar traslado · TransferdeLuxe" };

export default async function PaginaReservar() {
  const { data: aj } = await clienteAdmin().from("ajustes").select("modulos").maybeSingle();
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-3 text-3xl font-semibold tracking-tight text-marca-claro"><LogoMarca alto={88} prioridad />TransferdeLuxe</Link>
          <p className="mt-2 text-slate-300">Reserva tu traslado VIP en la Costa Dorada</p>
        </header>
        <FormularioReserva vuelos={leerModulos(aj?.modulos).vuelos} />
        <PieLegal className="mt-8" />
      </div>
    </main>
  );
}
