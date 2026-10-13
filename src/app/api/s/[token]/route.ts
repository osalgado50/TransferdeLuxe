import { clienteAdmin } from "@/lib/supabase/admin";
import { comprobarLimite } from "@/lib/limite";
import { ipCliente } from "@/lib/ip";
import { leerSeguimiento } from "@/lib/servicios/seguimiento";

export const dynamic = "force-dynamic";
const CABECERAS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/**
 * Ruta PÚBLICA (sin login) de la página de seguimiento /s/<token>: SOLO estado, posición del coche, hora estimada,
 * nombre de pila del conductor, modelo y matrícula. 404 si el token no existe; 410 si ya caducó.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const lim = comprobarLimite(`seguimiento-ip:${ipCliente(req.headers)}`, 60, 60_000);
  if (!lim.ok) return Response.json({ error: "Demasiadas peticiones" }, { status: 429, headers: { ...CABECERAS, "Retry-After": String(lim.reintentarEnS) } });
  const { token } = await params;
  try {
    const r = await leerSeguimiento(clienteAdmin(), token);
    if (!r) return Response.json({ error: "No encontrado" }, { status: 404, headers: CABECERAS });
    if (!r.ok) return Response.json({ caducado: true }, { status: 410, headers: CABECERAS });
    return Response.json(r.datos, { headers: CABECERAS });
  } catch (e) {
    console.error("[seguimiento]", e instanceof Error ? e.message : e);
    return Response.json({ error: "No disponible" }, { status: 503, headers: { ...CABECERAS, "Retry-After": "15" } });
  }
}
