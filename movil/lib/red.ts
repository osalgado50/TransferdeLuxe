// Red con freno: toda llamada lleva tiempo máximo y se anota si el servidor (API web) o Supabase responden.
// Si uno cae, se comprueba con backoff (2 s, 4 s, 8 s… hasta 60 s) contra un endpoint barato y, al volver,
// se avisa a quien escuche (cola de acciones, pantallas) para que la app se recupere sola. Incidente del 11/10/2026.
import { clasificarRespuesta, esperaBackoff, segundosRetryAfter } from "@dominio/reintento";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { API_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const TIEMPO_MAX_MS = 15_000;
export type Destino = "api" | "supabase";
interface Caida { fallos: number; proximo: number }
export interface EstadoRed { api: Caida | null; supabase: Caida | null }

const VENTANA_RACHA_MS = 2 * 60_000; // fallos seguidos dentro de 2 min cuentan como la misma racha (el backoff no se reinicia)
let estado: EstadoRed = { api: null, supabase: null };
const racha: Record<Destino, { fallos: number; ultimo: number }> = { api: { fallos: 0, ultimo: 0 }, supabase: { fallos: 0, ultimo: 0 } };
const oyentesEstado = new Set<() => void>();
const oyentesRecuperado = new Set<(d: Destino) => void>();
const sondas: Record<Destino, ReturnType<typeof setTimeout> | null> = { api: null, supabase: null };
const sondeando: Record<Destino, boolean> = { api: false, supabase: false };

function emitir(nuevo: EstadoRed) { estado = nuevo; oyentesEstado.forEach((f) => f()); }

/** Anota el resultado de una llamada. `retryAfterS`: lo que pidió el servidor (429/503). */
export function anotar(destino: Destino, ok: boolean, retryAfterS?: number | null) {
  const ahora = Date.now();
  const r = racha[destino];
  if (ok) {
    if (ahora - r.ultimo > VENTANA_RACHA_MS) r.fallos = 0;
    if (!estado[destino]) return;
    if (sondas[destino]) { clearTimeout(sondas[destino]!); sondas[destino] = null; }
    emitir({ ...estado, [destino]: null });
    oyentesRecuperado.forEach((f) => { try { f(destino); } catch { /* un oyente no rompe a los demás */ } });
    return;
  }
  r.fallos = ahora - r.ultimo > VENTANA_RACHA_MS ? 1 : r.fallos + 1;
  r.ultimo = ahora;
  const espera = Math.max(esperaBackoff(r.fallos, { baseMs: 2000, topeMs: 60_000 }), (retryAfterS ?? 0) * 1000);
  emitir({ ...estado, [destino]: { fallos: r.fallos, proximo: ahora + espera } });
  programarSonda(destino, espera);
}

function programarSonda(destino: Destino, ms: number) {
  if (sondas[destino]) clearTimeout(sondas[destino]!);
  sondas[destino] = setTimeout(() => { sondas[destino] = null; void sondear(destino); }, ms);
}

/** Comprobación barata: GET /api/salud (servidor) o /auth/v1/health (Supabase). Solo con la app en primer plano. */
async function sondear(destino: Destino) {
  if (!estado[destino] || sondeando[destino]) return;
  if (AppState.currentState !== "active") return; // se reanuda al volver a primer plano (ver abajo)
  sondeando[destino] = true;
  try {
    const url = destino === "api" ? `${API_URL}/api/salud` : `${SUPABASE_URL}/auth/v1/health`;
    const init: RequestInit = destino === "supabase" ? { headers: { apikey: SUPABASE_ANON_KEY } } : {};
    await fetchConTiempo(url, init, 8000, destino);
  } catch { /* ya anotado */ } finally { sondeando[destino] = false; }
}

/** Fuerza la comprobación ya (botón «Reintentar» o vuelta a primer plano). */
export function comprobarAhora() {
  (["api", "supabase"] as const).forEach((d) => { if (estado[d]) void sondear(d); });
}
AppState.addEventListener("change", (e) => { if (e === "active") comprobarAhora(); });

/** ¿Está marcado como caído? (para no lanzar recargas periódicas que ya se sabe que fallarán; la sonda lo vigila). */
export const caido = (d: Destino) => !!estado[d];

/** Avisa cuando un destino caído vuelve a responder (p. ej. para vaciar la cola o recargar). Devuelve la baja. */
export function alRecuperar(f: (d: Destino) => void): () => void {
  oyentesRecuperado.add(f);
  return () => { oyentesRecuperado.delete(f); };
}

export function useEstadoRed(): EstadoRed {
  return useSyncExternalStore((f) => { oyentesEstado.add(f); return () => { oyentesEstado.delete(f); }; }, () => estado);
}

/**
 * fetch con tiempo máximo (por defecto 15 s; al agotarse lanza como un error de red) que respeta la señal del
 * llamador y anota si `destino` responde. AbortController manual: AbortSignal.timeout/any no están garantizados en Hermes.
 */
export function fetchConTiempo(url: Parameters<typeof fetch>[0], init: RequestInit = {}, ms = TIEMPO_MAX_MS, destino: Destino = "api"): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const externa = init.signal;
  const propagar = () => ctrl.abort();
  if (externa) { if (externa.aborted) ctrl.abort(); else externa.addEventListener("abort", propagar); }
  return fetch(url, { ...init, signal: ctrl.signal }).then(
    (r) => {
      const ok = clasificarRespuesta(r.status, r.headers.get("content-type")) === "ok";
      anotar(destino, ok, ok ? null : segundosRetryAfter(r.headers.get("retry-after")));
      return r;
    },
    (e) => { if (!externa?.aborted) anotar(destino, false); throw e; },
  ).finally(() => { clearTimeout(t); externa?.removeEventListener("abort", propagar); });
}

/** fetch para supabase-js (createClient global.fetch): 20 s de tope y estado de Supabase. */
export const fetchSupabase = ((url: Parameters<typeof fetch>[0], init?: RequestInit) =>
  fetchConTiempo(url, init ?? {}, 20_000, "supabase")) as typeof fetch;
