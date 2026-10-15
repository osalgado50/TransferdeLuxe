// Filas que llegan por Realtime al panel en vivo (informe de estrés n.º 7 y n.º 26): fuera las pruebas automáticas y
// listas acotadas para un panel que se deja abierto días.

export const PREFIJO_PRUEBA_AUTOMATICA = "PRUEBA AUTOMÁTICA";

/** Servicio de las pruebas automáticas (scripts/prueba-*.mjs): marcado es_prueba o con notas «PRUEBA AUTOMÁTICA…». */
export const esServicioDePrueba = (s: { es_prueba?: boolean | null; notas?: string | null }) =>
  !!s.es_prueba || (s.notas ?? "").startsWith(PREFIJO_PRUEBA_AUTOMATICA);

/**
 * Acota una lista que crece con cada fila nueva: mientras no pase de `max` se deja tal cual (misma referencia). Si pasa,
 * se quitan las más antiguas que `horas` (salvo `conservar`, p. ej. graves sin resolver) y, si aún sobran, las más
 * antiguas hasta quedar en `max` (las conservadas no se quitan nunca).
 */
export function acotarFilas<T>(filas: T[], o: { fecha: (f: T) => string; max: number; horas: number; ahora: number; conservar?: (f: T) => boolean }): T[] {
  if (filas.length <= o.max) return filas;
  const limite = o.ahora - o.horas * 3600e3;
  const t = (f: T) => Date.parse(o.fecha(f)) || 0;
  const guardar = (f: T) => !!o.conservar?.(f);
  const quedan = filas.filter((f) => guardar(f) || t(f) >= limite);
  if (quedan.length <= o.max) return quedan;
  const sobran = quedan.length - o.max;
  const fuera = new Set([...quedan].filter((f) => !guardar(f)).sort((a, b) => t(a) - t(b)).slice(0, sobran));
  return quedan.filter((f) => !fuera.has(f));
}
