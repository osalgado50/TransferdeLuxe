// Fotos huérfanas en Storage: subidas (ticket o incidencia) que ninguna fila referencia. Lógica pura.

export interface ObjetoStorage { path: string; creado: string | null }
export const EDAD_MIN_HUERFANA_MS = 24 * 3600e3;

/**
 * Rutas que se pueden borrar: no las referencia ninguna fila y tienen más de 24 h (una foto recién subida puede estar
 * esperando a que el conductor termine el formulario). Sin fecha de creación fiable, no se toca.
 */
export function fotosHuerfanas(objetos: ObjetoStorage[], referenciadas: ReadonlySet<string>, ahora: Date, edadMinMs = EDAD_MIN_HUERFANA_MS): string[] {
  const limite = ahora.getTime() - edadMinMs;
  return objetos.filter((o) => {
    if (!o.path || referenciadas.has(o.path)) return false;
    const t = o.creado ? Date.parse(o.creado) : NaN;
    return Number.isFinite(t) && t < limite;
  }).map((o) => o.path);
}
