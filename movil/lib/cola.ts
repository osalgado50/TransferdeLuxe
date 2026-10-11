import AsyncStorage from "@react-native-async-storage/async-storage";
import { ColaAcciones } from "@/lib/offline/cola";
import { enviarAccion } from "./acciones";

type Oyente = () => void;
export interface Compartida { cola: ColaAcciones; rechazos: Map<string, string[]>; oyentes: Set<Oyente> }
const porConductor = new Map<string, Promise<Compartida>>();

/**
 * Una única cola persistente por conductor (AsyncStorage). Se carga una vez en memoria y cada cambio
 * se escribe en disco; así ColaAcciones (síncrona) se reutiliza tal cual desde la web.
 */
export function colaDe(conductorId: string): Promise<Compartida> {
  let c = porConductor.get(conductorId);
  if (c) return c;
  const clave = `tdl-cola:${conductorId}`;
  c = (async () => {
    let memoria: string | null = null;
    try { memoria = await AsyncStorage.getItem(clave); } catch { /* sin almacenamiento */ }
    const almacen = {
      get: () => memoria,
      set: (v: string) => { memoria = v; AsyncStorage.setItem(clave, v).catch(() => {}); },
    };
    const rechazos = new Map<string, string[]>();
    const oyentes = new Set<Oyente>();
    const cola = new ColaAcciones(almacen, (a) => enviarAccion({ idAccion: a.idAccion, servicioId: a.servicioId, accion: a.accion }),
      (a, e) => {
        const l = rechazos.get(a.servicioId) ?? [];
        if (!l.includes(e)) rechazos.set(a.servicioId, [...l, e]);
      });
    return { cola, rechazos, oyentes };
  })();
  porConductor.set(conductorId, c);
  return c;
}

export function avisar(c: Compartida) { c.oyentes.forEach((f) => f()); }

/** `forzar`: gesto del usuario, red o servidor recuperados (ignora el backoff); el temporizador lo respeta. */
export async function drenar(conductorId: string, forzar = false) {
  const c = await colaDe(conductorId);
  const r = await c.cola.vaciar(forzar);
  // Avisar solo si algo cambió o se intentó y falló (contador de intentos), no en cada vuelta del temporizador.
  if (r.enviadas || r.errores.length || (c.cola.pendientes().length && !r.omitida)) avisar(c);
  return r;
}
