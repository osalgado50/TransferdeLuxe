import "server-only";
import { createHash } from "node:crypto";
import { clienteAdmin } from "@/lib/supabase/admin";
import { puedeConducir, type Perfil } from "@/lib/dominio/tipos";
import { CacheTtl, expDeJwt } from "@/lib/cacheTtl";
import { comprobarLimite } from "@/lib/limite";
import { ipCliente } from "@/lib/ip";

// Protección frente a clientes defectuosos (incidente del 11/10/2026: una app en bucle hacía ~40 peticiones/s y
// cada una costaba auth.getUser + select perfiles en Supabase). Orden: límites baratos en memoria → caché del token
// → Supabase (una sola verificación en vuelo por token).
export const LIMITE_IP_MIN = 300; // por IP y minuto (holgado: varios móviles pueden compartir IP de operador)
export const LIMITE_IP_LOCAL_MIN = 1200; // sin cabecera de IP (todos parecen «local»): más alto para no castigar a todos por uno
export const LIMITE_TOKEN_MIN = 120; // por token y minuto (un dispositivo)
const TTL_OK_MS = 60_000; // perfil válido: como mucho 60 s (y nunca más allá del exp del JWT)
const TTL_NO_MS = 30_000; // token rechazado por Supabase o sin perfil
const RETRY_CAIDO_S = 10;

type Verificado = { perfil: Perfil | null };
const cache = new CacheTtl<Verificado>(1000);
const enVuelo = new Map<string, Promise<Verificado | "caido">>();

/** Solo para tests: olvida las verificaciones guardadas. */
export function vaciarCacheBearer() { cache.vaciar(); enVuelo.clear(); }
export const tamanoCacheBearer = () => cache.tamano;

export type Verificacion =
  | { tipo: "ok"; perfil: Perfil }
  | { tipo: "invalido" }
  | { tipo: "limite"; reintentarEnS: number }
  | { tipo: "caido" };

const hash = (t: string) => createHash("sha256").update(t).digest("base64url");

/** ¿Error definitivo de Supabase Auth (token malo/caducado/usuario borrado) o transitorio (red, 5xx, 429)? */
function definitivo(e: unknown): boolean {
  const x = e as { status?: unknown; name?: unknown };
  if (typeof x?.name === "string" && /Retryable|Fetch/i.test(x.name)) return false;
  if (typeof x?.status === "number") return x.status >= 400 && x.status < 500 && x.status !== 429;
  return true;
}

async function consultar(token: string): Promise<Verificado | "caido"> {
  const sb = clienteAdmin();
  let u: Awaited<ReturnType<typeof sb.auth.getUser>>;
  try { u = await sb.auth.getUser(token); } catch { return "caido"; }
  if (u.error || !u.data.user) return u.error && !definitivo(u.error) ? "caido" : { perfil: null };
  try {
    const { data, error } = await sb.from("perfiles").select("*").eq("id", u.data.user.id).maybeSingle();
    if (error) return "caido";
    return { perfil: (data as Perfil | null) ?? null };
  } catch { return "caido"; }
}

/** Verifica `Authorization: Bearer <access_token>` con límites por IP y por token y caché de la verificación. */
export async function verificarBearer(req: Request): Promise<Verificacion> {
  const ip = ipCliente(req.headers);
  const lip = comprobarLimite(`bearer-ip:${ip}`, ip === "local" ? LIMITE_IP_LOCAL_MIN : LIMITE_IP_MIN, 60_000);
  if (!lip.ok) return { tipo: "limite", reintentarEnS: lip.reintentarEnS };
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return { tipo: "invalido" };
  const token = m[1];
  const exp = expDeJwt(token);
  const ahora = Date.now();
  if (exp !== null && exp * 1000 <= ahora) return { tipo: "invalido" }; // caducado: ni se pregunta a Supabase
  const k = hash(token);
  const ltok = comprobarLimite(`bearer-tok:${k}`, LIMITE_TOKEN_MIN, 60_000);
  if (!ltok.ok) return { tipo: "limite", reintentarEnS: ltok.reintentarEnS };

  let v = cache.get(k);
  if (!v) {
    let p = enVuelo.get(k);
    if (!p) {
      p = consultar(token).finally(() => enVuelo.delete(k));
      enVuelo.set(k, p);
    }
    const r = await p;
    if (r === "caido") return { tipo: "caido" };
    const hastaExp = exp !== null ? exp * 1000 - Date.now() : TTL_OK_MS;
    cache.set(k, r, Math.min(r.perfil ? TTL_OK_MS : TTL_NO_MS, hastaExp));
    v = r;
  }
  return v.perfil ? { tipo: "ok", perfil: v.perfil } : { tipo: "invalido" };
}

/** Perfil a partir de `Authorization: Bearer <access_token>` (app nativa). null si falta, no es válido o no se pudo verificar. */
export async function perfilDesdeBearer(req: Request): Promise<Perfil | null> {
  const v = await verificarBearer(req);
  return v.tipo === "ok" ? v.perfil : null;
}

export const demasiadas = (reintentarEnS = 60) =>
  Response.json({ error: "Demasiadas peticiones. Espera un momento." }, { status: 429, headers: { "Retry-After": String(reintentarEnS) } });
const noDisponible = () =>
  Response.json({ error: "Servicio no disponible temporalmente. Reintentando…" }, { status: 503, headers: { "Retry-After": String(RETRY_CAIDO_S) } });
const sinSesion = () => Response.json({ error: "Sesión no válida. Vuelve a iniciar sesión." }, { status: 401 });

/** Respuesta para una verificación fallida: 401 (token), 429 con Retry-After (límite) o 503 con Retry-After (Supabase caído). */
export function respuestaVerificacion(v: Exclude<Verificacion, { tipo: "ok" }>): Response {
  if (v.tipo === "limite") return demasiadas(v.reintentarEnS);
  if (v.tipo === "caido") return noDisponible();
  return sinSesion();
}

type Resultado = { ok: true; yo: Perfil } | { ok: false; res: Response };
async function exigir(req: Request, permitido: (p: Perfil) => boolean, mensaje403: string): Promise<Resultado> {
  const v = await verificarBearer(req);
  if (v.tipo !== "ok") return { ok: false, res: respuestaVerificacion(v) };
  if (!permitido(v.perfil)) return { ok: false, res: Response.json({ error: mensaje403 }, { status: 403 }) };
  return { ok: true, yo: v.perfil };
}

/** 401 sin sesión válida, 403 si no es conductor (ni operador que conduce), 429/503 con Retry-After. */
export const exigirConductorBearer = (req: Request) => exigir(req, puedeConducir, "Solo los conductores pueden usar esta función.");

/** 401 sin sesión válida, 403 si no es operador (modo central de la app nativa), 429/503 con Retry-After. */
export const exigirOperadorBearer = (req: Request) => exigir(req, (p) => p.rol === "operador", "Solo la central puede usar esta función.");

/** 401 sin sesión válida, 403 si no es conductor ni operador (registro de avisos push: la central también los recibe). */
export const exigirUsuarioAppBearer = (req: Request) =>
  exigir(req, (p) => p.rol === "operador" || puedeConducir(p), "Esta cuenta no tiene acceso a la app.");

export async function leerJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}
export const datosNoValidos = () => Response.json({ error: "Datos no válidos." }, { status: 400 });
