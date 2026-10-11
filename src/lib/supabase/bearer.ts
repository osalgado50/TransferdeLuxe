import "server-only";
import { clienteAdmin } from "@/lib/supabase/admin";
import { puedeConducir, type Perfil } from "@/lib/dominio/tipos";

/** Perfil a partir de `Authorization: Bearer <access_token>` (app nativa). null si falta o no es válido. */
export async function perfilDesdeBearer(req: Request): Promise<Perfil | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const sb = clienteAdmin();
  const { data, error } = await sb.auth.getUser(m[1]).catch(() => ({ data: { user: null }, error: true }));
  if (error || !data.user) return null;
  const { data: p } = await sb.from("perfiles").select("*").eq("id", data.user.id).maybeSingle();
  return (p as Perfil | null) ?? null;
}

type Resultado = { ok: true; yo: Perfil } | { ok: false; res: Response };
/** 401 sin sesión válida, 403 si no es conductor (ni operador que conduce). */
export async function exigirConductorBearer(req: Request): Promise<Resultado> {
  const yo = await perfilDesdeBearer(req);
  if (!yo) return { ok: false, res: Response.json({ error: "Sesión no válida. Vuelve a iniciar sesión." }, { status: 401 }) };
  if (!puedeConducir(yo)) return { ok: false, res: Response.json({ error: "Solo los conductores pueden usar esta función." }, { status: 403 }) };
  return { ok: true, yo };
}

/** 401 sin sesión válida, 403 si no es operador (modo central de la app nativa). */
export async function exigirOperadorBearer(req: Request): Promise<Resultado> {
  const yo = await perfilDesdeBearer(req);
  if (!yo) return { ok: false, res: Response.json({ error: "Sesión no válida. Vuelve a iniciar sesión." }, { status: 401 }) };
  if (yo.rol !== "operador") return { ok: false, res: Response.json({ error: "Solo la central puede usar esta función." }, { status: 403 }) };
  return { ok: true, yo };
}

export async function leerJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}
export const demasiadas = () => Response.json({ error: "Demasiadas peticiones. Espera un momento." }, { status: 429 });
export const datosNoValidos = () => Response.json({ error: "Datos no válidos." }, { status: 400 });
