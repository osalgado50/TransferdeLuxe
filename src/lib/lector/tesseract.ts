"use client";
import type { DatosTicket, ImagenTicket, LectorTicket } from "./tipos";
import { extraerDatosTicket } from "./extraer";
import { lecturaCompleta, mejorLectura, type DatosAjustados } from "./plausibles";

/** Desenfoque de caja horizontal + vertical (radio r) sobre una imagen en gris. */
function cajas(g: Float32Array, w: number, h: number, r: number): Float32Array {
  const t = new Float32Array(g.length), o = new Float32Array(g.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += g[y * w + Math.min(w - 1, Math.max(0, x + k))]; t[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, y + k)) * w + x]; o[y * w + x] = s / n;
  }
  return o;
}

/**
 * Preparación de la foto como en el servidor (ver `ocrServidor.ts`): gris, desenfoque suave (σ≈1,4: tres cajas de
 * radio 1; σ≈2: dos de radio 2) que quita el moaré y el grano, contraste estirado y, en la pasada «umbral», blanco y
 * negro. null si el navegador no puede.
 */
async function preparar(dataUrl: string, p: "suave" | "medio" | "umbral"): Promise<string | null> {
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
    let g: Float32Array = new Float32Array(d.width * d.height);
    for (let i = 0, j = 0; i < d.data.length; i += 4, j++) g[j] = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    for (const r of p === "medio" ? [2, 2] : [1, 1, 1]) g = cajas(g, d.width, d.height, r);
    let min = 255, max = 0;
    for (const v of g) { if (v < min) min = v; if (v > max) max = v; }
    const escala = max > min ? 255 / (max - min) : 1;
    for (let i = 0, j = 0; i < d.data.length; i += 4, j++) {
      const v = (g[j] - min) * escala;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = p === "umbral" ? (v >= 120 ? 255 : 0) : v;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

// OCR de código abierto en el navegador: sin API, sin clave, sin coste. Los datos de idioma se descargan una vez
// (CDN pública de tesseract.js) y el navegador los cachea. Dos pasadas (desenfoque suave, medio, blanco y negro y tal cual) como en el servidor.
export class TesseractLector implements LectorTicket {
  constructor(private alProgreso?: (porcentaje: number) => void) {}
  async leer(img: ImagenTicket): Promise<DatosTicket> {
    const { createWorker } = await import("tesseract.js");
    const cb = this.alProgreso;
    const worker = await createWorker("spa", 1, cb ? { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") cb(Math.round(m.progress * 100)); } } : undefined);
    try {
      const original = `data:${img.mediaType};base64,${img.base64}`;
      const pasadas: (() => Promise<{ src: string; psm: string } | null>)[] = [
        ...(["suave", "medio", "umbral"] as const).map((p) => async () => { const src = await preparar(original, p); return src ? { src, psm: "6" } : null; }),
        async () => ({ src: original, psm: "3" }),
      ];
      const lecturas: DatosAjustados[] = [];
      for (const siguiente of pasadas) {
        const p = await siguiente();
        if (!p) continue;
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
