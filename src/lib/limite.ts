const golpes = new Map<string, { lista: number[]; ventanaMs: number }>();
let llamadas = 0;
const PURGAR_CADA = 500;

/** Borra las claves cuyos golpes ya han caducado todos (evita que el Map crezca sin límite). */
export function purgarCaducados(ahora = Date.now()): void {
  for (const [clave, { lista, ventanaMs }] of golpes) {
    if (!lista.length || ahora - lista[lista.length - 1] >= ventanaMs) golpes.delete(clave);
  }
}

export function clavesActivas(): number { return golpes.size; }

export function permitir(clave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  if (++llamadas % PURGAR_CADA === 0) purgarCaducados(ahora);
  const lista = (golpes.get(clave)?.lista ?? []).filter((t) => ahora - t < ventanaMs);
  if (lista.length >= max) { golpes.set(clave, { lista, ventanaMs }); return false; }
  lista.push(ahora); golpes.set(clave, { lista, ventanaMs }); return true;
}

/**
 * Como `permitir`, pero si se rechaza dice cuántos segundos faltan para el siguiente hueco (cabecera Retry-After).
 * Rechazar no cuenta como golpe: un cliente desbocado no alarga su propio bloqueo, pero cada rechazo es barato (sin BD).
 */
export function comprobarLimite(clave: string, max: number, ventanaMs: number): { ok: true } | { ok: false; reintentarEnS: number } {
  if (permitir(clave, max, ventanaMs)) return { ok: true };
  const lista = golpes.get(clave)?.lista ?? [];
  const primero = lista[lista.length - max] ?? lista[0] ?? Date.now();
  return { ok: false, reintentarEnS: Math.max(1, Math.ceil((primero + ventanaMs - Date.now()) / 1000)) };
}
