import Link from "next/link";
import LogoTVL from "@/components/comun/LogoTVL";

export default function Portada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 text-center">
      <div className="flex flex-col items-center">
        <LogoTVL alto={160} prioridad className="mb-6" />
        <h1 className="text-4xl font-semibold tracking-tight text-marca-claro">TransferdeLuxe</h1>
        <p className="mt-3 text-lg text-slate-300">Traslados VIP en la Costa Dorada · centro de control</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/reservar" className="rounded-lg bg-marca px-6 py-3 font-semibold text-white hover:bg-marca-oscuro">Reservar traslado</Link>
        <Link href="/login" className="rounded-lg border border-slate-600 px-6 py-3 text-slate-200 hover:border-marca-claro">Acceso central y conductores</Link>
      </div>
    </main>
  );
}
