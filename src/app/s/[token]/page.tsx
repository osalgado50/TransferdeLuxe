import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerSeguimiento } from "@/lib/servicios/seguimiento";
import { esTokenSeguimiento, idiomaPreferido } from "@/lib/dominio/seguimiento";
import PanelSeguimiento from "@/components/seguimiento/PanelSeguimiento";

export const dynamic = "force-dynamic";
// Página pública del cliente: nunca en buscadores ni con el enlace en el Referer de terceros.
export const metadata: Metadata = {
  title: "Tu traslado · TVL VIP Transfers",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

/** Seguimiento en directo del traslado (sin login): /s/<token>. */
export default async function Seguimiento({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!esTokenSeguimiento(token)) notFound();
  const idioma = idiomaPreferido((await headers()).get("accept-language"));
  let inicial: Awaited<ReturnType<typeof leerSeguimiento>> = null;
  let caida = false;
  try { inicial = await leerSeguimiento(clienteAdmin(), token); } catch { caida = true; /* el panel reintenta desde el navegador */ }
  if (inicial === null && !caida) notFound();
  return <PanelSeguimiento token={token} idioma={idioma} inicial={inicial && inicial.ok ? inicial.datos : null} caducado={!!inicial && !inicial.ok} />;
}
