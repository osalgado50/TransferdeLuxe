"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Pantalla de error de la central: si una consulta falla (Supabase caído, red…) se queda el menú y se ofrece reintentar,
 * en vez de tumbar todo el panel con un error 500.
 */
export default function ErrorCentral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[central]", error); }, [error]);
  return (
    <div role="alert" className="mx-auto mt-10 max-w-lg space-y-4 rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-slate-200">
      <h1 className="text-xl font-semibold text-red-300">No se ha podido cargar esta pantalla</h1>
      <p className="text-sm text-slate-300">
        Ha fallado la conexión con el servidor o con la base de datos. Los datos no se han perdido: vuelve a intentarlo en unos segundos.
      </p>
      {error.digest && <p className="text-xs text-slate-500">Referencia del error: {error.digest}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white hover:bg-marca-oscuro">
          Reintentar
        </button>
        <Link href="/central" className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:border-marca-claro">
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
