// Jornadas abiertas demasiado tiempo (informe de estrés n.º 17): aviso en la lista de Jornadas y alerta única a la
// central desde el vigilante. Lógica pura compartida por la web, el vigilante y los tests.
import { diaMadrid } from "./geo";
import { sumarDias } from "./dias";
import type { Jornada } from "./jornada";

/** A partir de estas horas abierta, probablemente se olvidó de cerrarla. */
export const HORAS_JORNADA_LARGA = 14;
const HORA_MS = 3600e3;

const fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtDia = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
const horaDe = (iso: string) => fmtHora.format(new Date(iso));
const diaCorto = (iso: string) => fmtDia.format(new Date(iso));

/** Horas enteras que lleva abierta (o que duró) una jornada. */
export const horasJornada = (inicio: string, fin: string | null, ahora: number) =>
  Math.floor(Math.max(0, (fin ? Date.parse(fin) : ahora) - Date.parse(inicio)) / HORA_MS);

/** Jornada abierta más de 14 h → «Abierta hace 54 h: ¿se olvidó de cerrarla?»; cerrada tras > 14 h → «Duró 54 h: revisa la salida». */
export function avisoJornadaLarga(j: { inicio: string; fin: string | null }, ahora: number): string | null {
  const h = horasJornada(j.inicio, j.fin, ahora);
  if (h < HORAS_JORNADA_LARGA) return null;
  return j.fin ? `Duró ${h} h: revisa la salida` : `Abierta hace ${h} h: ¿se olvidó de cerrarla?`;
}

/** «10:35», «10:35 (+1 día)» o «10:35 (17/10)» según el día (Madrid) de la salida respecto a la entrada. */
export function salidaConDia(entrada: string, salida: string): string {
  const d0 = diaMadrid(entrada), d1 = diaMadrid(salida);
  if (d0 === d1) return horaDe(salida);
  return sumarDias(d0, 1) === d1 ? `${horaDe(salida)} (+1 día)` : `${horaDe(salida)} (${diaCorto(salida)})`;
}

export interface DetalleDia {
  /** Nº de jornadas que empiezan ese día (si hay varias, la fila suma el tiempo trabajado de todas). */
  jornadas: number;
  /** El aviso más grave de las jornadas del día (abierta / demasiado larga). */
  aviso: string | null;
}
/** Detalle por conductor y día (misma clave que `registroPorDia`: «conductor|día de inicio en Madrid»). */
export function detallePorDia(jornadas: readonly Pick<Jornada, "conductor_id" | "inicio" | "fin">[], ahora: number): Map<string, DetalleDia> {
  const out = new Map<string, DetalleDia>();
  for (const j of jornadas) {
    const k = `${j.conductor_id}|${diaMadrid(j.inicio)}`;
    const d = out.get(k) ?? { jornadas: 0, aviso: null };
    d.jornadas++;
    const a = avisoJornadaLarga(j, ahora);
    // La abierta manda sobre la ya cerrada.
    if (a && (!d.aviso || (!j.fin && !d.aviso.startsWith("Abierta")))) d.aviso = a;
    out.set(k, d);
  }
  return out;
}

/** Alerta única a la central por jornada abierta > 14 h (clave = id de la jornada). null si aún no toca. */
export function alertaJornadaLarga(nombre: string, j: { id: string; inicio: string; fin: string | null }, ahora: number):
  { tipo: "jornada_larga"; clave: string; texto: string } | null {
  if (j.fin) return null;
  const h = horasJornada(j.inicio, null, ahora);
  if (h < HORAS_JORNADA_LARGA) return null;
  const desde = diaMadrid(j.inicio) === diaMadrid(new Date(ahora)) ? `las ${horaDe(j.inicio)}` : `las ${horaDe(j.inicio)} del ${diaCorto(j.inicio)}`;
  return { tipo: "jornada_larga", clave: j.id, texto: `⏳ ${nombre} lleva ${h} h con la jornada abierta (desde ${desde}): ¿se olvidó de cerrarla?` };
}
