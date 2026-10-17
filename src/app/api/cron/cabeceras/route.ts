import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * DIAGNÓSTICO TEMPORAL (17/10/2026): qué cabeceras de IP llegan detrás de la CDN de Hostinger, para elegir la que no
 * puede falsificar el cliente. Solo con `Authorization: Bearer $CRON_SECRET`; los valores salen con hash (sal secreta),
 * nunca en claro. Se borra en cuanto se sepa.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !iguales(req.headers.get("authorization") ?? "", `Bearer ${secreto}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const h = (v: string) => createHash("sha256").update(`${secreto}|${v.trim()}`).digest("hex").slice(0, 8);
  const ip: Record<string, string[]> = {};
  for (const [k, v] of req.headers) if (/ip|forwarded|client|real|cdn|via/i.test(k) && k !== "authorization") ip[k] = v.split(",").map(h);
  return NextResponse.json({ nombres: [...req.headers.keys()].sort(), ip }, { headers: { "Cache-Control": "no-store" } });
}
