"use client";
import type { DatosTicket, ImagenTicket, LectorTicket } from "./tipos";
import { extraerDatosTicket } from "./extraer";

// OCR de código abierto en el navegador: sin API, sin clave, sin coste. Los datos de idioma se descargan una vez
// (CDN pública de tesseract.js) y el navegador los cachea.
export class TesseractLector implements LectorTicket {
  constructor(private alProgreso?: (porcentaje: number) => void) {}
  async leer(img: ImagenTicket): Promise<DatosTicket> {
    const { createWorker } = await import("tesseract.js");
    const cb = this.alProgreso;
    const worker = await createWorker("spa", 1, cb ? { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") cb(Math.round(m.progress * 100)); } } : undefined);
    try {
      const { data } = await worker.recognize(`data:${img.mediaType};base64,${img.base64}`);
      return extraerDatosTicket(data.text);
    } finally {
      await worker.terminate();
    }
  }
}
