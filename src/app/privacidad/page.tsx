import type { Metadata } from "next";
import { headers } from "next/headers";
import PaginaLegal from "@/components/legal/PaginaLegal";
import { contenidoPrivacidad, TITULO_PRIVACIDAD } from "@/components/legal/contenidoPrivacidad";
import { leerIdioma } from "@/lib/i18n/portada";

type Props = { searchParams: Promise<{ lang?: string }> };
const idiomaDe = async (sp: Props["searchParams"]) => leerIdioma((await sp).lang, (await headers()).get("accept-language"));

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: `${TITULO_PRIVACIDAD[await idiomaDe(searchParams)]} · TransferdeLuxe` };
}

/** Política de privacidad (castellano, catalán o inglés: ?lang= o el idioma del navegador). */
export default async function Privacidad({ searchParams }: Props) {
  const idioma = await idiomaDe(searchParams);
  return <PaginaLegal titulo={TITULO_PRIVACIDAD[idioma]} idioma={idioma} ruta="/privacidad">{contenidoPrivacidad(idioma)}</PaginaLegal>;
}
