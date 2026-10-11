import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revisarRecibos } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cron: revisa recibos de Expo y borra tokens de dispositivos dados de baja. `Authorization: Bearer $CRON_SECRET`. No toca otros datos. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !iguales(req.headers.get("authorization") ?? "", `Bearer ${secreto}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await revisarRecibos()) });
  } catch (e) {
    console.error("Recibos push:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron revisar los recibos" }, { status: 500 });
  }
}
