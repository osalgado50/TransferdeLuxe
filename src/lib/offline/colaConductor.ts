"use client";
import { accionConductor } from "@/app/conductor/actions";
import { ColaAcciones } from "./cola";

type Oyente = () => void;
interface Compartida { cola: ColaAcciones; rechazos: Map<string, string[]>; oyentes: Set<Oyente> }
const porConductor = new Map<string, Compartida>();

/** Una única cola por conductor y pestaña: así los envíos nunca se solapan entre componentes. */
export function colaDe(conductorId: string): Compartida {
  let c = porConductor.get(conductorId);
  if (c) return c;
  const clave = `tdl-cola:${conductorId}`;
  const almacen = {
    get: () => { try { return localStorage.getItem(clave); } catch { return null; } },
    set: (v: string) => { try { localStorage.setItem(clave, v); } catch { /* sin almacenamiento */ } },
  };
  const rechazos = new Map<string, string[]>();
  const oyentes = new Set<Oyente>();
  const cola = new ColaAcciones(almacen, async (a) => {
    const r = await accionConductor({ idAccion: a.idAccion, servicioId: a.servicioId, accion: a.accion });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }, (a, e) => {
    const l = rechazos.get(a.servicioId) ?? [];
    if (!l.includes(e)) rechazos.set(a.servicioId, [...l, e]);
  });
  c = { cola, rechazos, oyentes };
  porConductor.set(conductorId, c);
  return c;
}

export async function drenar(conductorId: string) {
  const c = colaDe(conductorId);
  const r = await c.cola.vaciar();
  // Solo se avisa si algo cambió o sigue atascado: así no se refresca la página cada 20 s sin motivo.
  if (r.enviadas || r.errores.length || c.cola.pendientes().length) c.oyentes.forEach((f) => f());
  return r;
}
