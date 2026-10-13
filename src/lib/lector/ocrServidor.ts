import "server-only";
import os from "node:os";
import path from "node:path";
import type { Worker } from "tesseract.js";
import type { DatosTicket } from "./tipos";
import { extraerDatosTicket } from "./extraer";

/**
 * OCR de tickets en el servidor (para la app nativa, que no puede ejecutar tesseract.js): mismo motor libre y gratuito
 * que la web, sin API ni clave. Un solo worker reutilizado (un ticket cada vez) que se cierra tras 5 min sin uso. Si
 * arrancar o leer se pasa de tiempo, se descarta el worker y la cola sigue (nunca se queda bloqueada).
 */
const INACTIVO_MS = 5 * 60_000;
const ARRANQUE_MS = 40_000; // la primera vez baja el idioma (~2 MB) y compila el wasm
const LECTURA_MS = 20_000;
let worker: Promise<Worker> | null = null;
let cola: Promise<unknown> = Promise.resolve();
let temporizador: ReturnType<typeof setTimeout> | null = null;
/** Último paso que ha anunciado tesseract (para saber dónde se queda si no arranca). */
let ultimoPaso = "sin empezar";

function conTiempo<T>(p: Promise<T>, ms: number, fase: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, no) => { t = setTimeout(() => no(new Error(`${fase}: más de ${ms / 1000} s (último paso: ${ultimoPaso})`)), ms); });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

function descartar() {
  const w = worker;
  worker = null;
  void w?.then((x) => x.terminate()).catch(() => undefined);
}

async function obtenerWorker(): Promise<Worker> {
  if (!worker) {
    ultimoPaso = "importando tesseract.js";
    const { createWorker } = await import("tesseract.js");
    ultimoPaso = "creando el worker";
    worker = createWorker("spa", 1, {
      cachePath: path.join(os.tmpdir(), "tdl-tesseract"),
      logger: (m: { status: string; progress: number }) => { ultimoPaso = `${m.status} ${Math.round(m.progress * 100)}%`; },
      errorHandler: (e: unknown) => console.error("[ocr] worker:", e instanceof Error ? e.message : e),
    });
    worker.catch((e) => { ultimoPaso = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 150); worker = null; });
  }
  return worker;
}

function programarCierre() {
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(descartar, INACTIVO_MS);
  temporizador.unref?.();
}

/** Texto del ticket; lanza con la fase («arranque» / «lectura») si falla o se pasa de tiempo. */
export function leerTextoTicket(imagen: Buffer): Promise<string> {
  const tarea = cola.then(async () => {
    const t0 = Date.now();
    let w: Worker;
    try { w = await conTiempo(obtenerWorker(), ARRANQUE_MS, "arranque del OCR"); } catch (e) { descartar(); throw e; }
    const t1 = Date.now();
    try {
      const { data } = await conTiempo(w.recognize(imagen), LECTURA_MS, "lectura del ticket");
      console.log(`[ocr] arranque ${t1 - t0} ms · lectura ${Date.now() - t1} ms`);
      return data.text;
    } catch (e) { descartar(); throw e; }
  });
  cola = tarea.catch(() => undefined);
  return tarea.finally(programarCierre);
}

export async function leerTicketServidor(imagen: Buffer): Promise<DatosTicket> {
  return extraerDatosTicket(await leerTextoTicket(imagen));
}
