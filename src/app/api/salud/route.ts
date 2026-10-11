import { comprobarLimite } from "@/lib/limite";
import { ipCliente } from "@/lib/ip";
import { estadoBd } from "@/lib/salud";

export const dynamic = "force-dynamic";

/**
 * GET /api/salud — sin autenticación y barato: la app y la central lo usan para saber si el servidor responde
 * (sondas con backoff tras un fallo). La BD se comprueba como mucho una vez cada 30 s para TODO el proceso
 * (un select mínimo con 3 s de tope), así que mil sondas no generan mil consultas.
 */
export async function GET(req: Request) {
  const l = comprobarLimite(`salud:${ipCliente(req.headers)}`, 120, 60_000);
  const cabeceras = { "Cache-Control": "no-store" };
  if (!l.ok) return Response.json({ ok: false, error: "Demasiadas peticiones." }, { status: 429, headers: { ...cabeceras, "Retry-After": String(l.reintentarEnS) } });
  const bd = await estadoBd();
  return Response.json({ ok: true, servidor: "ok", bd: bd.estado, comprobadaHaceS: bd.haceS, hora: new Date().toISOString() }, { headers: cabeceras });
}
