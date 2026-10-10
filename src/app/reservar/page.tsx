import Link from "next/link";
import LogoTVL from "@/components/comun/LogoTVL";
import FormularioReserva from "./FormularioReserva";

export const metadata = { title: "Reservar traslado · TransferdeLuxe" };

export default function PaginaReservar() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-3 text-3xl font-semibold tracking-tight text-marca-claro"><LogoTVL alto={88} prioridad />TransferdeLuxe</Link>
          <p className="mt-2 text-slate-300">Reserva tu traslado VIP en la Costa Dorada</p>
        </header>
        <FormularioReserva />
      </div>
    </main>
  );
}
