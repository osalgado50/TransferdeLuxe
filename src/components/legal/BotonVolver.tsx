"use client";
import Link from "next/link";
import type { Idioma } from "@/lib/i18n/portada";

const TEXTO: Record<Idioma, string> = { es: "Volver", ca: "Tornar", en: "Back" };

/** «← Volver» en las páginas legales: atrás en el historial (el formulario sigue como estaba) o, si se entró directo, a la portada. */
export default function BotonVolver({ idioma }: { idioma: Idioma }) {
  return (
    <Link href={`/?lang=${idioma}`}
      onClick={(e) => { if (history.length > 1 && document.referrer.startsWith(location.origin)) { e.preventDefault(); history.back(); } }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-bold text-white hover:bg-white/10">
      ← {TEXTO[idioma]}
    </Link>
  );
}
