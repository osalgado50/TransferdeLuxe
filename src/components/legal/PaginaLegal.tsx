import Link from "next/link";
import type { ReactNode } from "react";
import LogoTVL from "@/components/comun/LogoTVL";
import PieLegal from "./PieLegal";

export const AVISO_WEB = "https://transfersvipluxe.com/aviso-legal/";
export const PRIVACIDAD_WEB = "https://transfersvipluxe.com/politica-de-privacidad/";
export const ACTUALIZADO = "11 de octubre de 2026";

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-marca-claro underline hover:text-white">{children}</a>;
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-marca-claro">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

export default function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-3 text-2xl font-semibold text-marca-claro"><LogoTVL alto={72} />TransferdeLuxe</Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">{titulo}</h1>
          <p className="mt-1 text-xs text-slate-500">Última actualización: {ACTUALIZADO}</p>
        </header>
        <article className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">{children}</article>
        <PieLegal />
      </div>
    </main>
  );
}
