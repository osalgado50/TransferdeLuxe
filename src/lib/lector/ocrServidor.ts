import "server-only";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Worker } from "tesseract.js";
import type { DatosTicket } from "./tipos";
import { extraerDatosTicket } from "./extraer";

/**
 * OCR de tickets en el servidor (para la app nativa, que no puede ejecutar tesseract.js): mismo motor libre y gratuito
 * que la web, sin API ni clave. Un solo worker reutilizado (un ticket cada vez) que se cierra tras 5 min sin uso. Si
 * arrancar o leer se pasa de tiempo, se descarta el worker y la cola sigue (nunca se queda bloqueada).
 *
 * En el hosting (Hostinger) el hilo aparte (worker_threads) que usa tesseract.js en Node se queda colgado al arrancar el
 * motor wasm; en el hilo principal sí funciona. Por eso el «worker» de tesseract corre aquí mismo, en el proceso: se
 * sustituye su adaptador de Node (crear hilo / enviar / recibir) por uno en memoria que llama directamente al script del
 * worker. Un ticket bloquea el servidor ~1 s mientras se lee: aceptable para el volumen de tickets de una flota.
 */
declare const __non_webpack_require__: NodeJS.Require;
/** El `require` de Node de verdad (webpack no lo toca): tesseract.js se carga de node_modules tal cual. */
const requerir = (m: string): unknown => __non_webpack_require__(m);
/** Versión del OCR del servidor (sale en el diagnóstico: así se sabe qué código responde tras un despliegue). */
const VERSION_OCR = "ocr-5-wasm-sincrono";
let enProcesoListo = false;
/**
 * Variante del motor wasm: primero la SIMD (más rápida); si aborta al arrancar, la siguiente vez la normal. Cada fallo de
 * emscripten (abort / printErr) queda en `ultimoPaso` para el diagnóstico.
 */
const VARIANTES = ["tesseract-core-simd-lstm", "tesseract-core-lstm"] as const;
let variante = 0;
type FabricaCore = (opts: Record<string, unknown>) => Promise<unknown>;
const modulos = new Map<string, WebAssembly.Module>();
/**
 * En Hostinger la compilación asíncrona del wasm (WebAssembly.instantiate) no termina nunca; la síncrona sí. Se compila
 * aquí (una vez, ~1–3 s) y se le da ya instanciado a emscripten con su gancho `instantiateWasm`.
 */
function instanciarSincrono(nombre: string) {
  return (imports: WebAssembly.Imports, recibir: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
    let m = modulos.get(nombre);
    if (!m) {
      const t = Date.now();
      m = new WebAssembly.Module(fs.readFileSync(__non_webpack_require__.resolve(`tesseract.js-core/${nombre}.wasm`)));
      modulos.set(nombre, m);
      ultimoPaso = `wasm ${nombre} compilado en ${Date.now() - t} ms`;
    }
    const i = new WebAssembly.Instance(m, imports);
    recibir(i, m);
    return i.exports;
  };
}
function getCoreConDiagnostico(): (oem: unknown, corePath: unknown, res: { progress: (p: { status: string; progress: number }) => void }) => Promise<FabricaCore> {
  return async (_oem, _corePath, res) => {
    const nombre = VARIANTES[Math.min(variante, VARIANTES.length - 1)];
    res.progress({ status: `loading tesseract core (${nombre})`, progress: 0 });
    const Core = requerir(`tesseract.js-core/${nombre}`) as FabricaCore;
    res.progress({ status: `loading tesseract core (${nombre})`, progress: 1 });
    return (opts) => {
      const p = Core({
        ...opts,
        instantiateWasm: instanciarSincrono(nombre),
        printErr: (t: string) => { ultimoPaso = `${nombre} printErr: ${t}`.slice(0, 200); },
        onAbort: (w: unknown) => { ultimoPaso = `${nombre} abort: ${String(w)}`.slice(0, 200); variante++; },
      });
      p.catch((e: unknown) => { ultimoPaso = `${nombre} error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200); variante++; });
      return p;
    };
  };
}
/** Sustituye el adaptador de hilos de tesseract.js por uno en el mismo proceso (antes de cargar createWorker). */
function prepararEnProceso() {
  if (enProcesoListo) return;
  const req = requerir;
  const nodo = req("tesseract.js/src/worker/node") as Record<string, unknown>;
  const script = req("tesseract.js/src/worker-script") as { dispatchHandlers: (p: unknown, send: (o: unknown) => void) => void; setAdapter: (a: unknown) => void };
  script.setAdapter({
    getCore: getCoreConDiagnostico(), gunzip: req("tesseract.js/src/worker-script/node/gunzip"),
    fetch: req("node-fetch"), ...(req("tesseract.js/src/worker-script/node/cache") as object),
  });
  class HiloFalso extends EventEmitter {
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
let ultimoPaso = "sin empezar";

/** ¿Puede este proceso crear memoria WebAssembly? (en hostings con límite de memoria virtual, no). */
function pruebaWasm(): string {
  try { new WebAssembly.Memory({ initial: 256, maximum: 32768 }); return "wasm ok"; } catch (e) { return `wasm: ${e instanceof Error ? e.message : e}`.slice(0, 120); }
}

function conTiempo<T>(p: Promise<T>, ms: number, fase: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, no) => {
    t = setTimeout(() => no(new Error(`${fase}: más de ${ms / 1000} s (último paso: ${ultimoPaso}; ${VERSION_OCR}; node ${process.version}; ${pruebaWasm()})`)), ms);
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
    ultimoPaso = "importando tesseract.js";
    prepararEnProceso();
    const { createWorker } = requerir("tesseract.js") as typeof import("tesseract.js");
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
