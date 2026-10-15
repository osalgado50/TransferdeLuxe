// Avisos a la central en lote (informe de estrés n.º 20): los tokens de los operadores se leen UNA vez por pasada del
// vigilante y todos los mensajes salen juntos en peticiones de ≤ 100 a Expo, en vez de 3 llamadas en serie por aviso.
import { camposSonidoPush } from "./sonidoPush";

export interface MensajeCentral { titulo: string; cuerpo: string; data: Record<string, unknown> }
export interface MensajeExpo { to: string; title: string; body: string; data: Record<string, unknown>; priority: "high"; [k: string]: unknown }

/** Un mensaje de Expo por aviso y dispositivo (tokens repetidos o vacíos, una vez). */
export function mensajesCentral(tokens: readonly string[], avisos: readonly MensajeCentral[]): MensajeExpo[] {
  const unicos = [...new Set(tokens.filter((t) => !!t))];
  return avisos.flatMap((a) => unicos.map((to) => ({
    to, title: a.titulo, body: a.cuerpo, data: a.data, priority: "high" as const,
    ...camposSonidoPush(a.data as { tipo?: string; grave?: boolean }),
  })));
}

/** Trozos de `n` (Expo admite como mucho 100 mensajes por petición). */
export function enLotes<T>(xs: readonly T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
