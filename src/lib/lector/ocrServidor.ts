import "server-only";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import type { Worker } from "tesseract.js";
import type { DatosAjustados, RangoPrecio } from "./plausibles";
import { rangoDelDia } from "./preciosCarburante";
import { extraerDatosTicket } from "./extraer";

/**
 * OCR de tickets en el servidor (para la app nativa, que no puede ejecutar tesseract.js): mismo motor libre y gratuito
 * que la web, sin API ni clave. Un solo worker reutilizado (un ticket cada vez) que se cierra tras 5 min sin uso. Si
 * arrancar o leer se pasa de tiempo, se descarta el worker y la cola sigue (nunca se queda bloqueada).
 *
 * En el hosting (Hostinger) el hilo aparte (worker_threads) de tesseract.js se quedaba colgado: le faltaba el `.wasm`
 * (ver más abajo) y su error no llega al proceso principal. Por eso el «worker» de tesseract corre aquí mismo: se
 * sustituye su adaptador de Node (crear hilo / enviar / recibir) por uno en memoria que llama directamente al script del
 * worker. Un ticket bloquea el servidor ~1 s mientras se lee: aceptable para el volumen de tickets de una flota.
 */
declare const __non_webpack_require__: NodeJS.Require;
/** El `require` de Node de verdad (webpack no lo toca): tesseract.js se carga de node_modules tal cual. */
const requerir = (m: string): unknown => __non_webpack_require__(m);
/** Versión del OCR del servidor (sale en el diagnóstico: así se sabe qué código responde tras un despliegue). */
const VERSION_OCR = "ocr-9";
let enProcesoListo = false;
/**
 * Motor wasm a usar. En Hostinger el despliegue NO incluye los `.wasm` de node_modules (sí los `.js`): la variante
 * `*.wasm.js` lleva el wasm dentro (base64) y es la que se usa; si no estuviera, la normal con su `.wasm` al lado.
 * Primero SIMD (más rápida) y, si no, sin SIMD. Los fallos de emscripten van al diagnóstico y cortan la espera.
 */
const CANDIDATOS = ["tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm", "tesseract-core-lstm"];
const existe = (m: string) => { try { __non_webpack_require__.resolve(`tesseract.js-core/${m}`); return true; } catch { return false; } };
function elegirCore(): string {
  const c = CANDIDATOS.find((m) => existe(m) && (m.endsWith(".wasm.js") || existe(`${m}.wasm`)));
  if (!c) throw new Error("no hay ningún motor de tesseract.js-core instalado");
  return c;
}
type FabricaCore = (opts: Record<string, unknown>) => Promise<unknown>;
/** Si el motor falla al arrancar, se avisa aquí para no esperar al límite de tiempo. */
let alFallarArranque: ((e: Error) => void) | null = null;
function getCoreConDiagnostico(): (oem: unknown, corePath: unknown, res: { progress: (p: { status: string; progress: number }) => void }) => Promise<FabricaCore> {
  return async (_oem, _corePath, res) => {
    const nombre = elegirCore();
    res.progress({ status: `loading tesseract core (${nombre})`, progress: 0 });
    const Core = requerir(`tesseract.js-core/${nombre}`) as FabricaCore;
    res.progress({ status: `loading tesseract core (${nombre})`, progress: 1 });
    return (opts) => {
      const p = Core({ ...opts, printErr: (t: string) => { paso(`${nombre}: ${t}`); } });
      p.catch((e: unknown) => {
        const m = `${nombre}: ${e instanceof Error ? e.message : String(e)}`;
        paso(m);
        alFallarArranque?.(new Error(`el motor no arranca (${m.slice(0, 300)})`));
      });
      return p;
    };
  };
}
/** Sustituye el adaptador de hilos de tesseract.js por uno en el mismo proceso (antes de cargar createWorker). */
function prepararEnProceso() {
  if (enProcesoListo) return;
  const req = requerir;
  // Next ya puede haber cargado tesseract.js (paquete externo): se olvidan sus módulos (salvo el script del worker) para
  // que createWorker se vuelva a cargar con el adaptador sustituido.
  const cache = __non_webpack_require__.cache ?? {};
  for (const k of Object.keys(cache)) if (/[\\/]tesseract\.js[\\/]src[\\/]/.test(k) && !/worker-script/.test(k)) delete cache[k];
  const nodo = req("tesseract.js/src/worker/node") as Record<string, unknown>;
  const script = req("tesseract.js/src/worker-script") as { dispatchHandlers: (p: unknown, send: (o: unknown) => void) => void; setAdapter: (a: unknown) => void };
  script.setAdapter({
    getCore: getCoreConDiagnostico(), gunzip: req("tesseract.js/src/worker-script/node/gunzip"),
    fetch: req("node-fetch"), ...(req("tesseract.js/src/worker-script/node/cache") as object),
  });
  class HiloFalso extends EventEmitter {
    constructor() { super(); paso("worker en el proceso"); }
    postMessage(p: unknown) { setImmediate(() => script.dispatchHandlers(p, (o) => this.emit("message", o))); }
    terminate() { this.removeAllListeners(); }
  }
  nodo.spawnWorker = () => new HiloFalso();
  nodo.send = async (w: HiloFalso, p: unknown) => w.postMessage(p);
  nodo.onMessage = (w: HiloFalso, h: (o: unknown) => void) => w.on("message", h);
  nodo.terminateWorker = (w: HiloFalso) => w.terminate();
  enProcesoListo = true;
}
const INACTIVO_MS = 5 * 60_000;
const ARRANQUE_MS = 40_000; // la primera vez baja el idioma (~2 MB) y compila el wasm
const LECTURA_MS = 20_000;
let worker: Promise<Worker> | null = null;
let cola: Promise<unknown> = Promise.resolve();
let temporizador: ReturnType<typeof setTimeout> | null = null;
/** Último paso que ha anunciado tesseract (para saber dónde se queda si no arranca). */
let pasos: string[] = [];
/** Anota un paso del arranque (se guardan los 14 últimos para el diagnóstico). */
function paso(t: string) { pasos = [...pasos, t.slice(0, 160)].slice(-14); }

/** ¿Puede este proceso crear memoria WebAssembly? (en hostings con límite de memoria virtual, no). */
function pruebaWasm(): string {
  try { new WebAssembly.Memory({ initial: 256, maximum: 32768 }); return "wasm ok"; } catch (e) { return `wasm: ${e instanceof Error ? e.message : e}`.slice(0, 120); }
}

function conTiempo<T>(p: Promise<T>, ms: number, fase: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, no) => {
    t = setTimeout(() => no(new Error(`${fase}: más de ${ms / 1000} s (pasos: ${pasos.join(" → ") || "ninguno"}; ${VERSION_OCR}; node ${process.version}; ${pruebaWasm()})`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

function descartar() {
  const w = worker;
  worker = null;
  void w?.then((x) => x.terminate()).catch(() => undefined);
}

async function obtenerWorker(): Promise<Worker> {
  if (!worker) {
    pasos = [];
    paso("importando tesseract.js");
    prepararEnProceso();
    const { createWorker } = requerir("tesseract.js") as typeof import("tesseract.js");
    paso("creando el worker");
    worker = createWorker("spa", 1, {
      cachePath: path.join(os.tmpdir(), "tdl-tesseract"),
      logger: (m: { status: string; progress: number }) => { paso(`${m.status} ${Math.round(m.progress * 100)}%`); },
      errorHandler: (e: unknown) => console.error("[ocr] worker:", e instanceof Error ? e.message : e),
    });
    worker.catch((e) => { paso(`error: ${e instanceof Error ? e.message : String(e)}`); worker = null; });
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
    const fallo = new Promise<never>((_, no) => { alFallarArranque = no; });
    fallo.catch(() => undefined);
    try { w = await conTiempo(Promise.race([obtenerWorker(), fallo]), ARRANQUE_MS, "arranque del OCR"); } catch (e) {
      descartar();
      // tesseract rechaza con textos, no con Error: se envuelve con los pasos para el diagnóstico.
      throw e instanceof Error ? e : new Error(`arranque del OCR: ${String(e).slice(0, 300)} (pasos: ${pasos.join(" → ")}; ${VERSION_OCR})`);
    }
    finally { alFallarArranque = null; }
    const t1 = Date.now();
    const pasosArranque = pasos.join(" → ");
    try {
      const { data } = await conTiempo(w.recognize(imagen), LECTURA_MS, "lectura del ticket");
      console.log(`[ocr] arranque ${t1 - t0} ms · lectura ${Date.now() - t1} ms · ${pasosArranque}`);
      return data.text;
    } catch (e) { descartar(); throw e; }
  });
  cola = tarea.catch(() => undefined);
  return tarea.finally(programarCierre);
}

/** Lee el ticket y corrige los números con los precios del día del Ministerio (si responde). */
export async function leerTicketServidor(imagen: Buffer): Promise<{ datos: DatosAjustados; referencia: RangoPrecio }> {
  const texto = await leerTextoTicket(imagen);
  const referencia = await rangoDelDia(extraerDatosTicket(texto).tipo_combustible);
  return { datos: extraerDatosTicket(texto, referencia), referencia };
}
