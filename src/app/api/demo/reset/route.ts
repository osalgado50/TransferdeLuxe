import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { sembrarDemo } from "@/lib/demo/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Reinicio diario de la demo, pensado para un cron: `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (process.env.NEXT_PUBLIC_MODO_DEMO !== "true") return new NextResponse(null, { status: 404 });
  const secreto = process.env.CRON_SECRET;
  const cabecera = req.headers.get("authorization") ?? "";
  if (!secreto || !iguales(cabecera, `Bearer ${secreto}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const pass = process.env.DEMO_PASSWORD;
  if (!pass) return NextResponse.json({ error: "Falta DEMO_PASSWORD" }, { status: 500 });
  try {
    await sembrarDemo(clienteAdmin(), pass);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Reset demo:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo reiniciar la demo" }, { status: 500 });
  }
}
