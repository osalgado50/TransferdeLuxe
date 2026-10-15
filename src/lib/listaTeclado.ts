/**
 * Navegación con flechas en una lista de sugerencias (combobox).
 * `actual` = -1 significa «ninguna opción activa». Las flechas dan la vuelta al llegar a un extremo.
 */
export function moverActivo(actual: number, total: number, tecla: "ArrowDown" | "ArrowUp"): number {
  if (total <= 0) return -1;
  if (tecla === "ArrowDown") return actual < 0 || actual >= total - 1 ? 0 : actual + 1;
  return actual <= 0 || actual >= total ? total - 1 : actual - 1;
}
