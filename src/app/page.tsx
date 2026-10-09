import Link from "next/link";

export default function Portada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 text-center">
      <div>
        <h1 className="text-5xl font-semibold tracking-tight text-amber-400">TransferdeLuxe</h1>
        <p className="mt-3 text-lg text-slate-300">Traslados VIP en la Costa Dorada · centro de control</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/reservar" className="rounded-lg bg-amber-400 px-6 py-3 font-semibold text-slate-950 hover:bg-amber-300">Reservar traslado</Link>
        <Link href="/login" className="rounded-lg border border-slate-600 px-6 py-3 text-slate-200 hover:border-amber-400">Acceso central y conductores</Link>
      </div>
    </main>
  );
}
