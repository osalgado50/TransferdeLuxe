import "server-only";
import os from "node:os";
import path from "node:path";
import type { Worker } from "tesseract.js";
import type { DatosTicket } from "./tipos";
import { extraerDatosTicket } from "./extraer";

/**
 * OCR de tickets en el servidor (para la app nativa, que no puede ejecutar tesseract.js): mismo motor libre y gratuito
 * que la web, sin API ni clave. Un solo worker reutilizado (cola: un ticket cada vez, ~1 s por ticket) que se cierra
 * tras 5 min sin uso para no ocupar memoria. Los datos del idioma se descargan una vez y se guardan en /tmp.
 */
const INACTIVO_MS = 5 * 60_000;
const TIEMPO_MAX_MS = 25_000;
let worker: Promise<Worker> | null = null;
let cola: Promise<unknown> = Promise.resolve();
let temporizador: ReturnType<typeof setTimeout> | null = null;

async function obtenerWorker(): Promise<Worker> {
  if (!worker) {
    const { createWorker } = await import("tesseract.js");
    worker = createWorker("spa", 1, { cachePath: path.join(os.tmpdir(), "tdl-tesseract") });
    worker.catch(() => { worker = null; }); // si falla (sin red para bajar el idioma), se reintenta la próxima vez
  }
  return worker;
}

function programarCierre() {
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    const w = worker;
    worker = null;
    void w?.then((x) => x.terminate()).catch(() => undefined);
  }, INACTIVO_MS);
  temporizador.unref?.();
}

/** Texto del ticket (o lanza si tarda más de 25 s o el OCR falla). */
export function leerTextoTicket(imagen: Buffer): Promise<string> {
  const tarea = cola.then(async () => {
    const w = await obtenerWorker();
    const { data } = await w.recognize(imagen);
    return data.text;
  });
  cola = tarea.catch(() => undefined);
  const limite = new Promise<never>((_, no) => setTimeout(() => no(new Error("El OCR ha tardado demasiado")), TIEMPO_MAX_MS).unref?.());
  return Promise.race([tarea, limite]).finally(programarCierre);
}

export async function leerTicketServidor(imagen: Buffer): Promise<DatosTicket> {
  return extraerDatosTicket(await leerTextoTicket(imagen));
}
