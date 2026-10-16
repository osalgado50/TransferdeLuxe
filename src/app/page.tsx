import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Playfair_Display } from "next/font/google";
import LogoMarca from "@/components/comun/LogoMarca";
import PaisajeCostaDorada from "@/components/portada/PaisajeCostaDorada";
import DestinoRotativo from "@/components/portada/DestinoRotativo";
import ReservaRapida from "@/components/portada/ReservaRapida";
import { IDIOMAS, leerIdioma, TEXTOS, type Idioma } from "@/lib/i18n/portada";

const titulo = Playfair_Display({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-titulo-portada", display: "swap" });

type Props = { searchParams: Promise<{ lang?: string }> };

async function idiomaDe(sp: Props["searchParams"]): Promise<Idioma> {
  return leerIdioma((await sp).lang, (await headers()).get("accept-language"));
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = TEXTOS[await idiomaDe(searchParams)];
  return {
    title: t.meta.titulo, description: t.meta.descripcion,
    alternates: { languages: { es: "/?lang=es", ca: "/?lang=ca", en: "/?lang=en" } },
  };
}

/**
 * Portada pública: web de reservas en castellano, catalán o inglés (?lang=, o el idioma del navegador). Paisaje de la
 * Costa Dorada al atardecer, titular grande con el destino que va cambiando, reserva rápida y, arriba, el acceso de los
 * profesionales (central y conductores). Privacidad y aviso legal, al final.
 */
export default async function Portada({ searchParams }: Props) {
  const idioma = await idiomaDe(searchParams);
  const t = TEXTOS[idioma];
  return (
    <div lang={idioma} className={`${titulo.variable} min-h-screen bg-[#070d1c] text-white`}>
      {/* Cabecera: logo, idioma y acceso profesionales (premium) */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href={`/?lang=${idioma}`} className="flex items-center gap-3" aria-label="TransferdeLuxe">
            <LogoMarca alto={48} soloEmblema />
            <span className="hidden font-titulo text-2xl font-bold tracking-wide sm:block">TransferdeLuxe</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label={t.nav.idioma}>
            <div className="flex rounded-full border border-white/20 bg-black/30 p-1 backdrop-blur" role="group" aria-label={t.nav.idioma}>
              {IDIOMAS.map((l) => (
                <Link key={l.codigo} href={`/?lang=${l.codigo}`} hrefLang={l.codigo} aria-current={l.codigo === idioma ? "true" : undefined} title={l.nombre}
                  className={`min-h-10 min-w-11 rounded-full px-3 py-2 text-center text-sm font-bold ${l.codigo === idioma ? "bg-white text-slate-950" : "text-white hover:bg-white/10"}`}>
                  {l.corto}
                </Link>
              ))}
            </div>
            <Link href="/login" className="group flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 px-4 text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-105">
              <span aria-hidden className="text-lg">★</span>
              <span className="leading-tight">
                <span className="block text-sm font-extrabold sm:text-base">{t.nav.profesionales}</span>
                <span className="hidden text-xs font-semibold opacity-80 sm:block">{t.nav.profesionalesSub}</span>
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Portada con el paisaje y la reserva */}
      <section className="relative isolate overflow-hidden">
        {/* El paisaje ocupa la primera pantalla (mar, palmeras y coche a la vista al entrar); debajo, fundido al fondo. */}
        <PaisajeCostaDorada className="absolute inset-x-0 top-0 -z-10 h-[100svh] min-h-[620px] w-full" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[100svh] min-h-[620px] bg-gradient-to-b from-black/45 via-transparent to-[#070d1c]/90 lg:bg-gradient-to-r lg:from-black/65 lg:via-black/20 lg:to-transparent" aria-hidden />
        <div className="absolute inset-x-0 top-[calc(100svh-160px)] -z-10 h-40 bg-gradient-to-b from-transparent to-[#070d1c]" aria-hidden />
        <div className="mx-auto grid max-w-7xl items-start gap-10 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-36">
          <div className="lg:sticky lg:top-32">
            <p className="inline-flex rounded-full border border-amber-200/40 bg-black/30 px-4 py-2 text-base font-semibold text-amber-100 backdrop-blur">{t.hero.etiqueta}</p>
            <h1 className="mt-6 font-titulo text-5xl font-extrabold leading-[1.05] tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-6xl lg:text-7xl">
              {t.hero.titulo}
              <DestinoRotativo destinos={t.hero.destinos} />
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-slate-100 drop-shadow sm:text-2xl">{t.hero.subtitulo}</p>
            <ul className="mt-8 flex flex-wrap gap-3">
              {t.hero.sello.map((s) => (
                <li key={s} className="rounded-full bg-black/35 px-4 py-2 text-lg font-medium text-white backdrop-blur"><span className="text-amber-300">✓</span> {s}</li>
              ))}
            </ul>
          </div>
          <div id="reserva" className="scroll-mt-28">
            <ReservaRapida idioma={idioma} />
          </div>
        </div>
      </section>

      {/* Ventajas */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="titulo-ventajas">
        <h2 id="titulo-ventajas" className="text-center font-titulo text-4xl font-bold sm:text-5xl">{t.ventajas.titulo}</h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.ventajas.items.map((v) => (
            <li key={v.titulo} className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6">
              <p className="text-5xl" aria-hidden>{v.icono}</p>
              <h3 className="mt-4 text-2xl font-bold text-amber-100">{v.titulo}</h3>
              <p className="mt-2 text-lg leading-relaxed text-slate-300">{v.texto}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-center">
          <a href="#reserva" className="inline-flex min-h-16 items-center rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 px-8 text-2xl font-bold text-slate-950 hover:brightness-105">{t.form.enviar}</a>
        </p>
      </section>

      {/* Pie: privacidad y aviso legal, al final de todo */}
      <footer className="border-t border-white/10 px-4 py-8 text-center text-base text-slate-400">
        <p>{t.pie.lema}</p>
        <p className="mt-2">
          <Link href={`/privacidad?lang=${idioma}`} className="hover:text-amber-200">{t.pie.privacidad}</Link>
          <span className="mx-3" aria-hidden>·</span>
          <Link href={`/aviso-legal?lang=${idioma}`} className="hover:text-amber-200">{t.pie.aviso}</Link>
        </p>
      </footer>
    </div>
  );
}
