"use client";
import type { DatosTicket, ImagenTicket, LectorTicket } from "./tipos";
import { extraerDatosTicket } from "./extraer";
import { lecturaCompleta, mejorLectura, type DatosAjustados } from "./plausibles";

/**
 * La foto pasada a blanco y negro (escala de grises, contraste estirado y umbral) en un canvas: con fotos de móvil el
 * OCR lee mucho mejor litros, precio e IVA. null si el navegador no puede.
 */
async function blancoYNegro(dataUrl: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const g = new Uint8ClampedArray(d.width * d.height);
    let min = 255, max = 0;
    for (let i = 0, j = 0; i < d.data.length; i += 4, j++) {
      const y = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
      g[j] = y; if (y < min) min = y; if (y > max) max = y;
    }
    const escala = max > min ? 255 / (max - min) : 1;
    for (let i = 0, j = 0; i < d.data.length; i += 4, j++) {
      const v = (g[j] - min) * escala >= 140 ? 255 : 0;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

// OCR de código abierto en el navegador: sin API, sin clave, sin coste. Los datos de idioma se descargan una vez
// (CDN pública de tesseract.js) y el navegador los cachea. Dos pasadas (blanco y negro y tal cual) como en el servidor.
export class TesseractLector implements LectorTicket {
  constructor(private alProgreso?: (porcentaje: number) => void) {}
  async leer(img: ImagenTicket): Promise<DatosTicket> {
    const { createWorker } = await import("tesseract.js");
    const cb = this.alProgreso;
    const worker = await createWorker("spa", 1, cb ? { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") cb(Math.round(m.progress * 100)); } } : undefined);
    try {
      const original = `data:${img.mediaType};base64,${img.base64}`;
      const bn = await blancoYNegro(original);
      const pasadas: { src: string; psm: string }[] = [...(bn ? [{ src: bn, psm: "6" }, { src: bn, psm: "3" }] : []), { src: original, psm: "3" }];
      const lecturas: DatosAjustados[] = [];
      for (const p of pasadas) {
        await worker.setParameters({ tessedit_pageseg_mode: p.psm as never });
        const { data } = await worker.recognize(p.src);
        const d = extraerDatosTicket(data.text);
        lecturas.push(d);
        if (lecturaCompleta(d)) break;
      }
      return mejorLectura(lecturas);
    } finally {
      await worker.terminate();
    }
  }
}
