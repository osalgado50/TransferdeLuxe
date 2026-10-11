import Link from "next/link";
import type { avisosMantenimiento } from "@/lib/dominio/mantenimiento";

export default function AvisosMantenimiento({ avisos }: { avisos: ReturnType<typeof avisosMantenimiento> }) {
  if (avisos.length === 0) return null;
  return (
    <section aria-label="Avisos de mantenimiento" className="rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-amber-200">🔧 Mantenimiento ({avisos.length})</h2>
        <Link href="/central/mantenimiento" className="text-amber-200 underline hover:text-marca-claro">Ver flota</Link>
      </div>
      <ul className="flex flex-wrap gap-2">
        {avisos.slice(0, 8).map((a) => (
          <li key={`${a.vehiculoId}-${a.clave}`} className={`rounded px-2 py-0.5 ${a.semaforo === "rojo" ? "bg-red-900/60 text-red-200" : "bg-amber-900/50 text-amber-200"}`}>
            {a.matricula} · {a.etiqueta}: {a.detalle}
          </li>))}
        {avisos.length > 8 && <li className="text-amber-200">y {avisos.length - 8} más…</li>}
      </ul>
    </section>
  );
}
