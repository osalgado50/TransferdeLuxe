import Link from "next/link";
import type { ReactNode } from "react";
import LogoTVL from "@/components/comun/LogoTVL";
import { IDIOMAS, type Idioma } from "@/lib/i18n/portada";
import PieLegal from "./PieLegal";

export const AVISO_WEB = "https://transfersvipluxe.com/aviso-legal/";
export const PRIVACIDAD_WEB = "https://transfersvipluxe.com/politica-de-privacidad/";
export const ACTUALIZADO: Record<Idioma, string> = { es: "16 de octubre de 2026", ca: "16 d’octubre de 2026", en: "16 October 2026" };
const ETIQUETAS: Record<Idioma, { actualizado: string; idioma: string; prevalece: string | null }> = {
  es: { actualizado: "Última actualización", idioma: "Idioma", prevalece: null },
  ca: { actualizado: "Darrera actualització", idioma: "Idioma", prevalece: "Traducció informativa: en cas de discrepància, preval la versió en castellà." },
  en: { actualizado: "Last updated", idioma: "Language", prevalece: "This translation is provided for information only: in case of any discrepancy, the Spanish version prevails." },
};

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-marca-claro underline hover:text-white">{children}</a>;
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold text-marca-claro">{titulo}</h2>
      <div className="space-y-2 text-base leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

/** Página legal (privacidad / aviso legal) en castellano, catalán o inglés, con selector de idioma. */
export default function PaginaLegal({ titulo, idioma = "es", ruta, children }: { titulo: string; idioma?: Idioma; ruta: string; children: ReactNode }) {
  const e = ETIQUETAS[idioma];
  return (
    <main lang={idioma} className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <nav aria-label={e.idioma} className="flex justify-end">
          <div className="flex rounded-full border border-white/15 p-1">
            {IDIOMAS.map((l) => (
              <Link key={l.codigo} href={`${ruta}?lang=${l.codigo}`} hrefLang={l.codigo} title={l.nombre} aria-current={l.codigo === idioma ? "true" : undefined}
                className={`min-h-10 min-w-11 rounded-full px-3 py-2 text-center text-sm font-bold ${l.codigo === idioma ? "bg-white text-slate-950" : "text-white hover:bg-white/10"}`}>
                {l.corto}
              </Link>
            ))}
          </div>
        </nav>
        <header className="text-center">
          <Link href={`/?lang=${idioma}`} className="inline-flex flex-col items-center gap-3 text-2xl font-semibold text-marca-claro"><LogoTVL alto={72} />TransferdeLuxe</Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">{titulo}</h1>
          <p className="mt-1 text-sm text-slate-500">{e.actualizado}: {ACTUALIZADO[idioma]}</p>
          {e.prevalece && <p className="mt-2 text-sm text-slate-400">{e.prevalece}</p>}
        </header>
        <article className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">{children}</article>
        <PieLegal idioma={idioma} />
      </div>
    </main>
  );
}
