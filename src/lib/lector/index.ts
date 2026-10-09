import "server-only";
import type { LectorTicket } from "./tipos";
// Lector por defecto: `TesseractLector` en el navegador (`lector/tesseract.ts`). `ClaudeHaikuLector` (claude.ts)
// queda desactivado (requeriría `ANTHROPIC_API_KEY`) y no se devuelve desde aquí.
export function obtenerLector(): LectorTicket {
  throw new Error("El lector de tickets funciona en el navegador (TesseractLector); ClaudeHaikuLector está desactivado");
}
export * from "./tipos";
export { esCoherente } from "./parsear";
