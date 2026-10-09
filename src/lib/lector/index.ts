import "server-only";
import { ClaudeHaikuLector } from "./claude";
import type { LectorTicket } from "./tipos";
// Lector por defecto: `TesseractLector` en el navegador (`lector/tesseract.ts`). `ClaudeHaikuLector` queda como
// alternativa desactivada (requeriría `ANTHROPIC_API_KEY`).
// Punto único para cambiar de proveedor (OCR.space, Mindee…): devolver otra implementación de LectorTicket.
export function obtenerLector(): LectorTicket { return new ClaudeHaikuLector(); }
export * from "./tipos";
export { esCoherente } from "./parsear";
