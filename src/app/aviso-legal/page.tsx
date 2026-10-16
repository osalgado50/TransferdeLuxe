import type { Metadata } from "next";
import { headers } from "next/headers";
import PaginaLegal from "@/components/legal/PaginaLegal";
import { contenidoAviso, TITULO_AVISO } from "@/components/legal/contenidoAviso";
import { leerIdioma } from "@/lib/i18n/portada";

type Props = { searchParams: Promise<{ lang?: string }> };
const idiomaDe = async (sp: Props["searchParams"]) => leerIdioma((await sp).lang, (await headers()).get("accept-language"));

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: `${TITULO_AVISO[await idiomaDe(searchParams)]} · TransferdeLuxe` };
}

/** Aviso legal (castellano, catalán o inglés: ?lang= o el idioma del navegador). */
export default async function AvisoLegal({ searchParams }: Props) {
  const idioma = await idiomaDe(searchParams);
  return <PaginaLegal titulo={TITULO_AVISO[idioma]} idioma={idioma} ruta="/aviso-legal">{contenidoAviso(idioma)}</PaginaLegal>;
}
