import Link from "next/link";
import FormularioReserva from "./FormularioReserva";

export const metadata = { title: "Reservar traslado · TransferdeLuxe" };

export default function PaginaReservar() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <Link href="/" className="text-3xl font-semibold tracking-tight text-amber-400">TransferdeLuxe</Link>
          <p className="mt-2 text-slate-300">Reserva tu traslado VIP en la Costa Dorada</p>
        </header>
        <FormularioReserva />
      </div>
    </main>
  );
}
