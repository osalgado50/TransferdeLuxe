// Caché pequeña en memoria con caducidad y expulsión del menos usado (LRU). Sin dependencias: sirve en el navegador
// (sugerencias de direcciones ya buscadas) y en el servidor.

export type CacheTemporal<T> = {
  get(clave: string): T | undefined;
  set(clave: string, valor: T): void;
  readonly size: number;
};

export function crearCacheTemporal<T>({ max, ttlMs, ahora = Date.now }: { max: number; ttlMs: number; ahora?: () => number }): CacheTemporal<T> {
  // Map conserva el orden de inserción: el primero es el menos usado (al leer se reinserta al final).
  const m = new Map<string, { hasta: number; valor: T }>();
  return {
    get(clave) {
      const e = m.get(clave);
      if (!e) return undefined;
      m.delete(clave);
      if (e.hasta <= ahora()) return undefined;
      m.set(clave, e);
      return e.valor;
    },
    set(clave, valor) {
      m.delete(clave);
      m.set(clave, { hasta: ahora() + ttlMs, valor });
      while (m.size > max) m.delete(m.keys().next().value as string);
    },
    get size() { return m.size; },
  };
}
