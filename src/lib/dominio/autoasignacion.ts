import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";
import { tiempoTraslado } from "./planificacion";
import { bloqueoConductor, type Ausencia } from "./ausencias";
import { cabeServicio, type HorarioConductor } from "./horarios";

/**
 * Asignación automática (lógica pura y determinista; la usan la central web, la API y los tests).
 *
 * Entrada: servicios pendientes elegidos + conductores elegidos (vehículo habitual, compromisos fijos del día y posición
 * opcional) + estrategia + margen mínimo. Algoritmo: inserción voraz por hora de recogida comprobando que cada conductor
 * llega con ≥ margen mínimo desde el fin de su servicio anterior y que no rompe el siguiente; después, mejora local
 * (mover / intercambiar servicios entre conductores) según la estrategia. Sin aleatoriedad: misma entrada, misma salida.
 * Tiempos en ms (epoch) para poder viajar en JSON entre servidor y cliente.
 */
export type Estrategia = "equitativo" | "menos_km" | "equilibrado";
export const ESTRATEGIAS: { clave: Estrategia; titulo: string; explicacion: string }[] = [
  { clave: "equitativo", titulo: "Equitativo", explicacion: "Reparte el mismo número de servicios entre los conductores (contando los que ya tienen)." },
  { clave: "menos_km", titulo: "Menos km", explicacion: "Minimiza los km en vacío entre servicios, aunque alguno trabaje más." },
  { clave: "equilibrado", titulo: "Equilibrado", explicacion: "Menos km, pero ningún conductor con más del doble de servicios que el que menos." },
];
export const esEstrategia = (x: unknown): x is Estrategia => ESTRATEGIAS.some((e) => e.clave === x);

export interface ServicioAuto {
  id: string; inicio: number; duracionMin: number; pasajeros: number; maletas: number;
  origen: Punto | null; destino: Punto | null;
  /** Compromisos: false si está fuera del día (solo cuenta para encajar, no para repartir). */
  delDia?: boolean;
}
export interface VehiculoAuto { id: string; plazas: number; maletas: number; estado: "activo" | "taller" }
export interface ConductorAuto {
  id: string; nombre: string; vehiculo: VehiculoAuto | null;
  /** Servicios ya asignados/aceptados/en curso: fijos, no se mueven. */
  compromisos: ServicioAuto[];
  /** Posición actual (GPS reciente): punto de partida si no tiene servicio anterior. */
  posicion?: Punto | null;
  /** Ausencias (vacaciones, fiesta…): no se le propone nada en esos días/franjas. */
  ausencias?: Ausencia[];
  /** Día (Madrid) en que ya ha cerrado la jornada: nada más ese día. */
  jornadaCerradaDia?: string | null;
  /** Horario: nada fuera de turno, en la pausa ni que no le deje volver a la base antes del fin del tramo. */
  horario?: HorarioConductor | null;
}
export interface EntradaAuto {
  servicios: ServicioAuto[]; conductores: ConductorAuto[]; estrategia: Estrategia; margenMinimoMin: number; ahora: number;
  /** Base/depósito (el coche sale de ella y vuelve a ella en cada tramo). */
  base?: Punto | null;
}
export interface LineaPropuesta {
  servicioId: string; conductorId: string | null;
  /** Llegada estimada a la recogida (ms); null si no hay servicio anterior ni posición útil. */
  llegadaEstimada: number | null;
  /** Peor margen (min) entre la llegada a esta recogida y la llegada al siguiente compromiso; null sin datos. */
  margenMin: number | null; margenAntesMin: number | null; margenDespuesMin: number | null;
  /** Km en vacío para llegar a esta recogida (desde el servicio anterior o la posición). */
  kmVacio: number | null;
  /** Asignada y cumple todo (capacidad, sin solapes, margen mínimo). */
  ok: boolean;
  /** Incumple algo duro: solape, capacidad, taller, no llega (margen < 0) o recogida ya pasada. */
  grave: boolean;
  /** Por qué no se asigna (sin conductor) o qué incumple (asignada a mano); null si todo bien. */
  motivoSiNo: string | null;
  subcontratar: boolean;
}
export interface MetricaConductor { conductorId: string; nombre: string; servicios: number; nuevos: number; horas: number; kmVacio: number }
export interface Propuesta { lineas: LineaPropuesta[]; metricas: MetricaConductor[] }

const MIN = 60_000;
/** Sin coordenadas se supone este traslado (min) para no dar por bueno lo que no se puede medir. */
export const TRASLADO_DESCONOCIDO_MIN = 30;
/** La posición actual solo cuenta para llegar si la recogida es dentro de estas horas. */
export const VENTANA_POSICION_MIN = 180;
const MAX_PASADAS = 6;
const EPS = 1e-6;
const FACTOR_CARRETERA = 1.3;

const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const hh = (t: number) => fmt.format(new Date(t));
const r1 = (x: number) => Math.round(x * 10) / 10;
const km = (a: Punto | null | undefined, b: Punto | null | undefined): number | null => (a && b ? distanciaKm(a, b) * FACTOR_CARRETERA : null);
const fin = (s: ServicioAuto) => s.inicio + s.duracionMin * MIN;
const porHora = (a: ServicioAuto, b: ServicioAuto) => a.inicio - b.inicio || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const porId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type Item = ServicioAuto & { fijo: boolean };

export function problemaCapacidad(c: Pick<ConductorAuto, "vehiculo">, s: Pick<ServicioAuto, "pasajeros" | "maletas">): string | null {
  const v = c.vehiculo;
  if (!v) return "Sin vehículo habitual";
  if (v.estado === "taller") return "Vehículo en taller";
  if (v.plazas < s.pasajeros) return `Vehículo de ${v.plazas} plazas (necesita ${s.pasajeros})`;
  if (v.maletas < s.maletas) return `Vehículo con ${v.maletas} maletas (necesita ${s.maletas})`;
  return null;
}

export interface Chequeo {
  ok: boolean; grave: boolean; motivo: string | null;
  llegada: number | null; margenAntes: number | null; margenDespues: number | null; kmVacio: number | null; kmDelta: number;
}

/** ¿Puede el conductor hacer `s` con el resto de su ruta (`otros`, sin `s`)? */
export function comprobar(c: ConductorAuto, otros: ServicioAuto[], s: ServicioAuto, margenMin: number, ahora: number, puntoBase: Punto | null = null): Chequeo {
  const base: Chequeo = { ok: false, grave: true, motivo: null, llegada: null, margenAntes: null, margenDespues: null, kmVacio: null, kmDelta: 0 };
  if (s.inicio < ahora) return { ...base, motivo: `La recogida (${hh(s.inicio)}) ya pasó` };
  const bloqueo = bloqueoConductor(c, s.inicio);
  if (bloqueo) return { ...base, motivo: bloqueo.motivo };
  const cap = problemaCapacidad(c, s);
  if (cap) return { ...base, motivo: cap };
  const lista = otros.filter((o) => o.id !== s.id).sort(porHora);
  if (c.horario) {
    const hz = cabeServicio(c.horario, s, { base: puntoBase, agenda: lista.map((o) => ({ id: o.id, inicio: o.inicio, fin: fin(o) })) });
    if (!hz.cabe) return { ...base, motivo: hz.motivo };
  }
  const finS = fin(s);
  const solape = lista.find((o) => o.inicio < finS && s.inicio < fin(o));
  if (solape) return { ...base, motivo: `Ocupado de ${hh(solape.inicio)} a ${hh(fin(solape))}` };
  const prev = lista.filter((o) => o.inicio < s.inicio).pop() ?? null;
  const next = lista.find((o) => o.inicio > s.inicio) ?? null;

  let llegada: number | null = null, margenAntes: number | null = null, kmVacio: number | null = null;
  let motivo: string | null = null, grave = false;
  if (prev) {
    const tr = tiempoTraslado(prev.destino, s.origen) ?? TRASLADO_DESCONOCIDO_MIN;
    llegada = fin(prev) + tr * MIN;
    margenAntes = Math.floor((s.inicio - llegada) / MIN);
    kmVacio = km(prev.destino, s.origen);
    if (margenAntes < 0) { grave = true; motivo = `No llega: termina ${hh(fin(prev))} y llegaría ${hh(llegada)} (recogida ${hh(s.inicio)})`; }
    else if (margenAntes < margenMin) motivo = `Solo ${margenAntes} min de margen desde su servicio anterior (mínimo ${margenMin})`;
  } else if (c.posicion && s.origen) {
    kmVacio = km(c.posicion, s.origen);
    if (s.inicio - ahora <= VENTANA_POSICION_MIN * MIN) {
      llegada = ahora + (tiempoTraslado(c.posicion, s.origen) ?? 0) * MIN;
      margenAntes = Math.floor((s.inicio - llegada) / MIN);
      if (margenAntes < 0) { grave = true; motivo = `No llega desde donde está: llegaría ${hh(llegada)} (recogida ${hh(s.inicio)})`; }
    }
  }
  let margenDespues: number | null = null;
  if (next) {
    const tr2 = tiempoTraslado(s.destino, next.origen) ?? TRASLADO_DESCONOCIDO_MIN;
    margenDespues = Math.floor((next.inicio - (finS + tr2 * MIN)) / MIN);
    if (margenDespues < margenMin && !grave) {
      if (margenDespues < 0) grave = true;
      motivo = margenDespues < 0
        ? `No llegaría a su servicio de las ${hh(next.inicio)}`
        : `Solo ${margenDespues} min de margen hasta su servicio de las ${hh(next.inicio)} (mínimo ${margenMin})`;
    }
  }
  const desde = prev ? prev.destino : (c.posicion ?? null);
  const hasta = next ? next.origen : null;
  const kmDelta = (km(desde, s.origen) ?? 0) + (km(s.destino, hasta) ?? 0) - (km(desde, hasta) ?? 0);
  return { ok: !motivo, grave, motivo, llegada, margenAntes, margenDespues, kmVacio, kmDelta };
}

/** Métricas de una ruta: servicios del día (fijos + nuevos), nuevos, horas (servicio + traslados) y km en vacío. */
export function metricasRuta(c: ConductorAuto, items: Item[]): MetricaConductor {
  const orden = [...items].sort(porHora);
  let kmV = orden.length && c.posicion ? km(c.posicion, orden[0].origen) ?? 0 : 0;
  let minutos = 0;
  orden.forEach((s, i) => {
    if (s.delDia !== false) minutos += s.duracionMin;
    if (i > 0) {
      kmV += km(orden[i - 1].destino, s.origen) ?? 0;
      minutos += tiempoTraslado(orden[i - 1].destino, s.origen) ?? 0;
    }
  });
  return {
    conductorId: c.id, nombre: c.nombre, servicios: orden.filter((s) => s.delDia !== false).length,
    nuevos: orden.filter((s) => !s.fijo).length, horas: r1(minutos / 60), kmVacio: r1(kmV),
  };
}

const util = (c: ConductorAuto) => !!c.vehiculo && c.vehiculo.estado === "activo";

class Estado {
  readonly rutas = new Map<string, Item[]>();
  readonly asign: Record<string, string | null> = {};
  constructor(readonly e: EntradaAuto, readonly cs: ConductorAuto[]) {
    for (const c of cs) this.rutas.set(c.id, c.compromisos.map((x) => ({ ...x, fijo: true })));
  }
  ruta(id: string) { return this.rutas.get(id)!; }
  poner(s: ServicioAuto, cid: string) { this.ruta(cid).push({ ...s, fijo: false }); this.asign[s.id] = cid; }
  quitar(sid: string) {
    const cid = this.asign[sid];
    if (cid) this.rutas.set(cid, this.ruta(cid).filter((x) => x.id !== sid));
    this.asign[sid] = null;
  }
  /** Todos los servicios nuevos de la ruta siguen cumpliendo. */
  rutaOk(c: ConductorAuto, items: Item[]) {
    return items.every((x) => x.fijo || comprobar(c, items, x, this.e.margenMinimoMin, this.e.ahora, this.e.base ?? null).ok);
  }
  cuentas() { return this.cs.filter(util).map((c) => metricasRuta(c, this.ruta(c.id))); }
}

function objetivo(st: Estado): number[] {
  const ms = st.cuentas();
  const n = ms.map((m) => m.servicios);
  const sumSq = n.reduce((t, x) => t + x * x, 0);
  const kmT = ms.reduce((t, m) => t + m.kmVacio, 0);
  const tope = 2 * Math.max(1, n.length ? Math.min(...n) : 0);
  const viol = n.reduce((t, x) => t + Math.max(0, x - tope), 0);
  switch (st.e.estrategia) {
    case "menos_km": return [kmT, sumSq];
    case "equilibrado": return [viol, kmT, sumSq];
    default: return [sumSq, kmT];
  }
}
const mejor = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - EPS) return true; if (a[i] > b[i] + EPS) return false; }
  return false;
};

/** Texto cuando nadie puede: «Ana: Ocupado de 10:00 a 11:00 · Luis: Vehículo en taller…». */
function motivoNadie(motivos: { nombre: string; motivo: string }[]): string {
  if (!motivos.length) return "No hay conductores seleccionados";
  const partes = motivos.slice(0, 3).map((m) => `${m.nombre}: ${m.motivo}`);
  return `Ningún conductor puede — ${partes.join(" · ")}${motivos.length > 3 ? ` · y ${motivos.length - 3} más` : ""}`;
}

/** Inserta `s` en el mejor conductor según la estrategia. Devuelve el motivo si nadie puede. */
function insertar(st: Estado, s: ServicioAuto): string | null {
  const { e } = st;
  const cuentas = new Map(st.cuentas().map((m) => [m.conductorId, m]));
  const viables: { c: ConductorAuto; ch: Chequeo; n: number; horas: number }[] = [];
  const fallos: { nombre: string; motivo: string }[] = [];
  for (const c of st.cs) {
    const ch = comprobar(c, st.ruta(c.id), s, e.margenMinimoMin, e.ahora, e.base ?? null);
    if (!ch.ok) { fallos.push({ nombre: c.nombre, motivo: ch.motivo ?? "No encaja" }); continue; }
    const m = cuentas.get(c.id);
    viables.push({ c, ch, n: m?.servicios ?? 0, horas: m?.horas ?? 0 });
  }
  if (!viables.length) return motivoNadie(fallos);
  let pool = viables;
  if (e.estrategia === "equilibrado") {
    const tras = (cid: string) => [...cuentas.values()].map((m) => m.servicios + (m.conductorId === cid ? 1 : 0));
    const dentro = viables.filter((v) => { const n = tras(v.c.id); return v.n + 1 <= 2 * Math.max(1, Math.min(...n)); });
    if (dentro.length) pool = dentro;
  }
  const clave = (v: (typeof viables)[number]): number[] =>
    e.estrategia === "equitativo" ? [v.n, v.horas, v.ch.kmDelta] : [v.ch.kmDelta, v.n, v.horas];
  const elegido = [...pool].sort((a, b) => {
    const ka = clave(a), kb = clave(b);
    for (let i = 0; i < ka.length; i++) if (Math.abs(ka[i] - kb[i]) > EPS) return ka[i] - kb[i];
    return porId(a.c, b.c);
  })[0];
  st.poner(s, elegido.c.id);
  return null;
}

/**
 * Mejora por movimientos e intercambios. Con tope de tiempo: es O(n²) pares × O(n) por evaluación y corre en el hilo del
 * servidor (medido: 100 servicios / 20 conductores 1,2 s; 300 / 100, 35 s con todo el servidor parado). Con el tope, la
 * propuesta sale igual de válida (cada paso solo acepta cambios que cumplen) aunque algo menos afinada.
 */
export const LIMITE_MEJORA_MS = 300;
function mejorar(st: Estado, servicios: ServicioAuto[], limiteMs = LIMITE_MEJORA_MS) {
  const fin = Date.now() + limiteMs;
  const cs = st.cs;
  const byId = new Map(cs.map((c) => [c.id, c]));
  for (let pasada = 0; pasada < MAX_PASADAS; pasada++) {
    let hubo = false;
    // Mover un servicio a otro conductor.
    for (const s of servicios) {
      if (Date.now() > fin) return;
      const desde = st.asign[s.id];
      if (!desde) continue;
      let actual = objetivo(st);
      for (const c of cs) {
        if (c.id === desde) continue;
        const nueva = [...st.ruta(c.id), { ...s, fijo: false }];
        if (!comprobar(c, st.ruta(c.id), s, st.e.margenMinimoMin, st.e.ahora, st.e.base ?? null).ok || !st.rutaOk(c, nueva)) continue;
        const origen = st.asign[s.id]!;
        st.quitar(s.id); st.poner(s, c.id);
        const o = objetivo(st);
        if (mejor(o, actual) && st.rutaOk(byId.get(origen)!, st.ruta(origen))) { actual = o; hubo = true; break; }
        st.quitar(s.id); st.poner(s, origen);
      }
    }
    // Intercambiar dos servicios entre conductores.
    for (let i = 0; i < servicios.length; i++) {
      if (Date.now() > fin) return;
      for (let j = i + 1; j < servicios.length; j++) {
        const a = servicios[i], b = servicios[j];
        const ca = st.asign[a.id], cb = st.asign[b.id];
        if (!ca || !cb || ca === cb) continue;
        const actual = objetivo(st);
        st.quitar(a.id); st.quitar(b.id);
        st.poner(a, cb); st.poner(b, ca);
        const ok = st.rutaOk(byId.get(ca)!, st.ruta(ca)) && st.rutaOk(byId.get(cb)!, st.ruta(cb));
        if (ok && mejor(objetivo(st), actual)) { hubo = true; continue; }
        st.quitar(a.id); st.quitar(b.id);
        st.poner(a, ca); st.poner(b, cb);
      }
    }
    if (!hubo) break;
  }
}

/** Propuesta automática. */
export function proponerAsignacion(e: EntradaAuto): Propuesta {
  const cs = [...e.conductores].sort(porId);
  const st = new Estado(e, cs);
  const servicios = [...e.servicios].sort(porHora);
  const motivos: Record<string, { motivo: string; subcontratar: boolean }> = {};
  const utiles = cs.filter(util);
  for (const s of servicios) {
    st.asign[s.id] = null;
    if (s.inicio < e.ahora) { motivos[s.id] = { motivo: `La recogida (${hh(s.inicio)}) ya pasó`, subcontratar: false }; continue; }
    if (!utiles.some((c) => c.vehiculo!.plazas >= s.pasajeros && c.vehiculo!.maletas >= s.maletas)) {
      motivos[s.id] = { motivo: `Ningún vehículo seleccionado lleva ${s.pasajeros} pax y ${s.maletas} maletas: subcontratar`, subcontratar: true };
      continue;
    }
    const m = insertar(st, s);
    if (m) motivos[s.id] = { motivo: m, subcontratar: false };
  }
  mejorar(st, servicios);
  // Segunda oportunidad para los que quedaron fuera (la mejora puede haber liberado hueco).
  for (const s of servicios) {
    if (st.asign[s.id] || motivos[s.id]?.subcontratar || s.inicio < e.ahora) continue;
    const m = insertar(st, s);
    if (m) motivos[s.id] = { motivo: m, subcontratar: false }; else delete motivos[s.id];
  }
  return evaluarAsignacion(e, st.asign, motivos);
}

/**
 * Evalúa una asignación concreta (la propuesta o la cambiada a mano): cada línea se comprueba contra la ruta completa
 * de su conductor (compromisos + el resto de servicios asignados en la propuesta).
 */
export function evaluarAsignacion(e: EntradaAuto, asignacion: Record<string, string | null>,
  motivos: Record<string, { motivo: string; subcontratar: boolean }> = {}): Propuesta {
  const cs = [...e.conductores];
  const porCond = new Map(cs.map((c) => [c.id, c]));
  const rutas = new Map<string, Item[]>(cs.map((c) => [c.id, c.compromisos.map((x) => ({ ...x, fijo: true }))]));
  const servicios = [...e.servicios].sort(porHora);
  for (const s of servicios) {
    const cid = asignacion[s.id];
    if (cid && rutas.has(cid)) rutas.get(cid)!.push({ ...s, fijo: false });
  }
  const lineas = servicios.map((s): LineaPropuesta => {
    const cid = asignacion[s.id] ?? null;
    const c = cid ? porCond.get(cid) : undefined;
    if (!c) {
      return { servicioId: s.id, conductorId: null, llegadaEstimada: null, margenMin: null, margenAntesMin: null, margenDespuesMin: null,
        kmVacio: null, ok: false, grave: false, motivoSiNo: motivos[s.id]?.motivo ?? "Sin asignar", subcontratar: motivos[s.id]?.subcontratar ?? false };
    }
    const ch = comprobar(c, rutas.get(c.id)!, s, e.margenMinimoMin, e.ahora, e.base ?? null);
    const ms = [ch.margenAntes, ch.margenDespues].filter((x): x is number => x != null);
    return {
      servicioId: s.id, conductorId: c.id, llegadaEstimada: ch.llegada, margenMin: ms.length ? Math.min(...ms) : null,
      margenAntesMin: ch.margenAntes, margenDespuesMin: ch.margenDespues, kmVacio: ch.kmVacio == null ? null : r1(ch.kmVacio),
      ok: ch.ok, grave: ch.grave, motivoSiNo: ch.motivo, subcontratar: false,
    };
  });
  return { lineas, metricas: cs.map((c) => metricasRuta(c, rutas.get(c.id)!)) };
}

/** Semáforo del margen de una línea: verde ≥ mínimo, naranja entre 0 y el mínimo, rojo si no llega; gris sin datos. */
export function colorMargen(margen: number | null, minimo: number): "verde" | "naranja" | "rojo" | "gris" {
  if (margen == null) return "gris";
  if (margen < 0) return "rojo";
  return margen < minimo ? "naranja" : "verde";
}

/** Comprobaciones de la propuesta (para tests y para la prueba en producción): solapes y márgenes por debajo del mínimo. */
export function auditarPropuesta(e: EntradaAuto, p: Propuesta): string[] {
  const errores: string[] = [];
  for (const c of e.conductores) {
    const nuevos = p.lineas.filter((l) => l.conductorId === c.id).map((l) => e.servicios.find((s) => s.id === l.servicioId)!);
    const ruta = [...c.compromisos, ...nuevos].sort(porHora);
    for (let i = 1; i < ruta.length; i++) {
      const a = ruta[i - 1], b = ruta[i];
      if (fin(a) > b.inicio) errores.push(`${c.nombre}: solape ${a.id} / ${b.id}`);
      const esNuevo = nuevos.includes(b) || nuevos.includes(a);
      const tr = tiempoTraslado(a.destino, b.origen) ?? TRASLADO_DESCONOCIDO_MIN;
      const margen = Math.floor((b.inicio - fin(a) - tr * MIN) / MIN);
      if (esNuevo && margen < e.margenMinimoMin) errores.push(`${c.nombre}: margen ${margen} min entre ${a.id} y ${b.id}`);
    }
    for (const s of nuevos) { const cap = problemaCapacidad(c, s); if (cap) errores.push(`${c.nombre}: ${cap} (${s.id})`); }
    for (const s of nuevos) {
      if (!c.horario) continue;
      const hz = cabeServicio(c.horario, s, { base: e.base ?? null, agenda: ruta.filter((o) => o.id !== s.id).map((o) => ({ id: o.id, inicio: o.inicio, fin: fin(o) })) });
      if (!hz.cabe) errores.push(`${c.nombre}: ${hz.motivo} (${s.id})`);
    }
  }
  return errores;
}
