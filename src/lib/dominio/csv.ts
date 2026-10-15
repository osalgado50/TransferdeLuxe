// Celdas CSV para Excel en español (separador «;»): coma decimal y sin inyección de fórmulas.

/** Número con coma decimal (Excel en español lo lee como número); sin separador de miles. */
export const numeroCsv = (n: number) => (Number.isFinite(n) ? String(n).replace(".", ",") : "");

/**
 * Celda de texto: un texto que empieza por = + - @ (o tabulador/retorno) se abriría como fórmula en Excel/LibreOffice;
 * se le antepone «'». Entre comillas si lleva ; " o saltos de línea.
 */
export function textoCsv(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Celda: los números con coma decimal (nunca con «'»), el resto como texto; null → vacía. */
export function celdaCsv(v: string | number | null | undefined): string {
  if (v == null) return "";
  return typeof v === "number" ? numeroCsv(v) : textoCsv(v);
}
