import Link from "next/link";
import type { ReactNode } from "react";
import LogoMarca from "@/components/comun/LogoMarca";
import { IDIOMAS, type Idioma } from "@/lib/i18n/portada";
import PieLegal from "./PieLegal";

/**
 * Titular ficticio: TransferdeLuxe es una empresa inventada para el Hackathon de Vibe Coding (las bases no permiten
 * datos reales). Plantilla: los datos entre corchetes los rellenaría el titular real antes de usar la app de verdad.
 */
export const CORREO_PRIVACIDAD = "privacidad@transferdeluxe.test";
const FICHA: Record<Idioma, { aviso: string; filas: [string, string][] }> = {
  es: {
    aviso: "TransferdeLuxe es una empresa ficticia creada para el Hackathon de Vibe Coding (Big School). Estos textos son una plantilla: antes de usar la aplicación con clientes reales, el titular debe completar los datos entre corchetes.",
    filas: [["Titular", "TransferdeLuxe Demo, S.L. (empresa ficticia)"], ["NIF", "[NIF del titular]"], ["Domicilio", "[Domicilio social]"],
      ["Registro Mercantil", "[Datos registrales]"], ["Correo de contacto y privacidad", CORREO_PRIVACIDAD]],
  },
  ca: {
    aviso: "TransferdeLuxe és una empresa fictícia creada per al Hackathon de Vibe Coding (Big School). Aquests textos són una plantilla: abans de fer servir l’aplicació amb clients reals, el titular ha de completar les dades entre claudàtors.",
    filas: [["Titular", "TransferdeLuxe Demo, S.L. (empresa fictícia)"], ["NIF", "[NIF del titular]"], ["Domicili", "[Domicili social]"],
      ["Registre Mercantil", "[Dades registrals]"], ["Correu de contacte i privacitat", CORREO_PRIVACIDAD]],
  },
  en: {
    aviso: "TransferdeLuxe is a fictitious company created for the Vibe Coding Hackathon (Big School). These texts are a template: before using the application with real customers, the owner must fill in the details in square brackets.",
    filas: [["Owner", "TransferdeLuxe Demo, S.L. (fictitious company)"], ["Tax ID (NIF)", "[Owner’s tax ID]"], ["Registered address", "[Registered office]"],
      ["Commercial Registry", "[Registry details]"], ["Contact and privacy email", CORREO_PRIVACIDAD]],
  },
};

/** Datos identificativos del titular (ficticio) con el aviso de plantilla. */
export function FichaTitular({ idioma }: { idioma: Idioma }) {
  const f = FICHA[idioma];
  return (
    <>
      <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{f.aviso}</p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {f.filas.map(([k, v]) => (
          <div key={k} className="contents"><dt className="font-semibold text-slate-200">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </>
  );
}
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
          <Link href={`/?lang=${idioma}`} className="inline-flex flex-col items-center gap-3 text-2xl font-semibold text-marca-claro"><LogoMarca alto={72} />TransferdeLuxe</Link>
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
