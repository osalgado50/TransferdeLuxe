// Hoja de cierre de jornada: estado del vehículo al terminar el día (daños, niveles, combustible y km).
// Lógica pura compartida por la web (PWA del conductor y central), la app nativa y el servidor.
import type { EstadoModulos } from "./modulos";

/** Zona del diagrama del coche visto desde arriba (DELANTERA arriba). Posición en una rejilla de ANCHO_DIAGRAMA × ALTO_DIAGRAMA. */
export interface ZonaVehiculo { id: string; etiqueta: string; x: number; y: number; w: number; h: number; tipo: "carroceria" | "luz" | "cristal" | "rueda" | "retrovisor" }

export const ANCHO_DIAGRAMA = 100;
export const ALTO_DIAGRAMA = 155;

/** Las zonas, en orden de lectura (de delante a atrás, de izquierda a derecha). La izquierda del coche queda a la izquierda. */
export const ZONAS_VEHICULO: readonly ZonaVehiculo[] = [
  { id: "faro_izq", etiqueta: "Faro izq.", x: 20, y: 0, w: 14, h: 12, tipo: "luz" },
  { id: "parachoques_del", etiqueta: "Parachoques del.", x: 35, y: 0, w: 30, h: 12, tipo: "carroceria" },
  { id: "faro_der", etiqueta: "Faro der.", x: 66, y: 0, w: 14, h: 12, tipo: "luz" },
  { id: "aleta_del_izq", etiqueta: "Aleta del. izq.", x: 20, y: 13, w: 14, h: 24, tipo: "carroceria" },
  { id: "capo", etiqueta: "Capó", x: 35, y: 13, w: 30, h: 24, tipo: "carroceria" },
  { id: "aleta_del_der", etiqueta: "Aleta del. der.", x: 66, y: 13, w: 14, h: 24, tipo: "carroceria" },
  { id: "rueda_del_izq", etiqueta: "Rueda del. izq.", x: 3, y: 16, w: 15, h: 20, tipo: "rueda" },
  { id: "rueda_del_der", etiqueta: "Rueda del. der.", x: 82, y: 16, w: 15, h: 20, tipo: "rueda" },
  { id: "parabrisas", etiqueta: "Parabrisas", x: 20, y: 38, w: 60, h: 12, tipo: "cristal" },
  { id: "retrovisor_izq", etiqueta: "Retrovisor izq.", x: 3, y: 51, w: 15, h: 12, tipo: "retrovisor" },
  { id: "retrovisor_der", etiqueta: "Retrovisor der.", x: 82, y: 51, w: 15, h: 12, tipo: "retrovisor" },
  { id: "puerta_del_izq", etiqueta: "Puerta del. izq.", x: 20, y: 51, w: 14, h: 26, tipo: "carroceria" },
  { id: "techo", etiqueta: "Techo", x: 35, y: 51, w: 30, h: 53, tipo: "carroceria" },
  { id: "puerta_del_der", etiqueta: "Puerta del. der.", x: 66, y: 51, w: 14, h: 26, tipo: "carroceria" },
  { id: "puerta_tras_izq", etiqueta: "Puerta tras. izq.", x: 20, y: 78, w: 14, h: 26, tipo: "carroceria" },
  { id: "puerta_tras_der", etiqueta: "Puerta tras. der.", x: 66, y: 78, w: 14, h: 26, tipo: "carroceria" },
  { id: "luna_trasera", etiqueta: "Luna trasera", x: 20, y: 105, w: 60, h: 12, tipo: "cristal" },
  { id: "aleta_tras_izq", etiqueta: "Aleta tras. izq.", x: 20, y: 118, w: 14, h: 24, tipo: "carroceria" },
  { id: "porton", etiqueta: "Portón", x: 35, y: 118, w: 30, h: 24, tipo: "carroceria" },
  { id: "aleta_tras_der", etiqueta: "Aleta tras. der.", x: 66, y: 118, w: 14, h: 24, tipo: "carroceria" },
  { id: "rueda_tras_izq", etiqueta: "Rueda tras. izq.", x: 3, y: 120, w: 15, h: 20, tipo: "rueda" },
  { id: "rueda_tras_der", etiqueta: "Rueda tras. der.", x: 82, y: 120, w: 15, h: 20, tipo: "rueda" },
  { id: "piloto_izq", etiqueta: "Piloto izq.", x: 20, y: 143, w: 14, h: 12, tipo: "luz" },
  { id: "parachoques_tras", etiqueta: "Parachoques tras.", x: 35, y: 143, w: 30, h: 12, tipo: "carroceria" },
  { id: "piloto_der", etiqueta: "Piloto der.", x: 66, y: 143, w: 14, h: 12, tipo: "luz" },
];
export const IDS_ZONAS = ZONAS_VEHICULO.map((z) => z.id);
const ETIQUETA_ZONA = new Map(ZONAS_VEHICULO.map((z) => [z.id, z.etiqueta]));
export const etiquetaZona = (id: string) => ETIQUETA_ZONA.get(id) ?? id;

/** Zonas válidas, sin repetir y en el orden del diagrama. */
export function normalizarZonas(zonas: Iterable<string>): string[] {
  const s = new Set(zonas);
  return IDS_ZONAS.filter((id) => s.has(id));
}
export function alternarZona(zonas: readonly string[], id: string): string[] {
  return normalizarZonas(zonas.includes(id) ? zonas.filter((z) => z !== id) : [...zonas, id]);
}

// ── Estado técnico ──
export type IdItemTecnico = "neumaticos" | "aceite" | "refrigerante" | "luces" | "testigos_cuadro" | "otra_averia";
export type ValorTecnico = "ok" | "revisar" | "falta";
export interface ItemTecnico { id: IdItemTecnico; etiqueta: string; ayuda?: string; malo: "revisar" | "falta"; textoOk: string; textoMalo: string; grave: boolean }

export const ITEMS_TECNICOS: readonly ItemTecnico[] = [
  { id: "neumaticos", etiqueta: "Neumáticos", malo: "revisar", textoOk: "OK", textoMalo: "Revisar", grave: false },
  { id: "aceite", etiqueta: "Aceite", malo: "falta", textoOk: "OK", textoMalo: "Falta", grave: false },
  { id: "refrigerante", etiqueta: "Agua de motor (refrigerante)", malo: "falta", textoOk: "OK", textoMalo: "Falta", grave: false },
  { id: "luces", etiqueta: "Luces", malo: "revisar", textoOk: "OK", textoMalo: "Revisar", grave: false },
  { id: "testigos_cuadro", etiqueta: "Testigos del cuadro", ayuda: "Motor, revisión o inspección encendidos", malo: "revisar", textoOk: "Apagados", textoMalo: "Encendido", grave: true },
  { id: "otra_averia", etiqueta: "Otra avería mecánica", ayuda: "Ruidos, frenos, embrague, dirección…", malo: "revisar", textoOk: "No", textoMalo: "Sí", grave: true },
];

export const TESTIGOS = [
  { id: "motor", etiqueta: "motor" },
  { id: "revision", etiqueta: "revisión" },
  { id: "inspeccion", etiqueta: "inspección" },
] as const;
export type IdTestigo = (typeof TESTIGOS)[number]["id"];

export type Tecnico = Record<IdItemTecnico, ValorTecnico> & { testigos?: IdTestigo[] };

/** Todo en OK (valor inicial del formulario). */
export const tecnicoInicial = (): Tecnico =>
  ({ neumaticos: "ok", aceite: "ok", refrigerante: "ok", luces: "ok", testigos_cuadro: "ok", otra_averia: "ok", testigos: [] });

export const COMBUSTIBLE = [
  { id: "lleno", etiqueta: "Lleno" }, { id: "3_4", etiqueta: "3/4" }, { id: "1_2", etiqueta: "1/2" },
  { id: "1_4", etiqueta: "1/4" }, { id: "reserva", etiqueta: "Reserva" },
] as const;
export type Combustible = (typeof COMBUSTIBLE)[number]["id"];
export const etiquetaCombustible = (c: string) => COMBUSTIBLE.find((x) => x.id === c)?.etiqueta ?? c;

export const MAX_COMENTARIO = 1000;
export const MAX_KM = 2_000_000;

export type GravedadCierre = "grave" | "mantenimiento" | "ok";
export interface DatosCierre { zonas: readonly string[]; tecnico: Tecnico; combustible: Combustible | string }

const malo = (t: Tecnico, id: IdItemTecnico) => (t[id] ?? "ok") !== "ok";

/** grave: daños, testigo encendido u otra avería · mantenimiento: falta aceite/agua, neumáticos o luces a revisar, reserva · ok. */
export function gravedadCierre(c: DatosCierre): GravedadCierre {
  if (c.zonas.length > 0 || malo(c.tecnico, "testigos_cuadro") || malo(c.tecnico, "otra_averia")) return "grave";
  if (malo(c.tecnico, "aceite") || malo(c.tecnico, "refrigerante") || malo(c.tecnico, "neumaticos") || malo(c.tecnico, "luces")
    || c.combustible === "reserva") return "mantenimiento";
  return "ok";
}

const enumerar = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} y ${l.at(-1)}`);

/** Problemas en frases cortas: «testigo de motor», «falta aceite», «combustible en reserva»… */
export function problemasCierre(c: DatosCierre): string[] {
  const t = c.tecnico, out: string[] = [];
  if (malo(t, "testigos_cuadro")) {
    const ts = (t.testigos ?? []).map((id) => TESTIGOS.find((x) => x.id === id)?.etiqueta).filter((x): x is "motor" | "revisión" | "inspección" => !!x);
    out.push(ts.length === 0 ? "testigo encendido" : `${ts.length > 1 ? "testigos" : "testigo"} de ${enumerar(ts)}`);
  }
  if (malo(t, "otra_averia")) out.push("otra avería mecánica");
  if (malo(t, "aceite")) out.push("falta aceite");
  if (malo(t, "refrigerante")) out.push("falta agua de motor");
  if (malo(t, "neumaticos")) out.push("neumáticos a revisar");
  if (malo(t, "luces")) out.push("luces a revisar");
  if (c.combustible === "reserva") out.push("combustible en reserva");
  return out;
}

export const ICONO_GRAVEDAD: Record<GravedadCierre, string> = { grave: "🔴", mantenimiento: "🟠", ok: "🟢" };
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Texto para la central: «🔴 Daños en Puerta del. izq., Aleta tras. der. · testigo de motor · 0001-TDL · Marc». */
export function resumenCierre(c: DatosCierre & { matricula?: string | null; conductor?: string | null }): string {
  const g = gravedadCierre(c);
  const partes: string[] = [];
  if (c.zonas.length) partes.push(`Daños en ${normalizarZonas(c.zonas).map(etiquetaZona).join(", ")}`);
  partes.push(...problemasCierre(c));
  if (!partes.length) partes.push("Cierre sin incidencias");
  partes[0] = mayus(partes[0]);
  return [`${ICONO_GRAVEDAD[g]} ${partes[0]}`, ...partes.slice(1), c.matricula || null, c.conductor || null].filter(Boolean).join(" · ");
}

/** km del cierre: vacío = no se indica; si se indica, entero ≥ km actuales del vehículo. */
export function validarKm(km: unknown, kmActual: number): { ok: true; km: number | null } | { ok: false; error: string } {
  if (km === null || km === undefined || km === "") return { ok: true, km: null };
  const n = typeof km === "string" ? Number(km.replace(/\./g, "").trim()) : km;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_KM) return { ok: false, error: "Los km deben ser un número entero." };
  if (n < kmActual) return { ok: false, error: `Los km no pueden ser menos que los actuales del vehículo (${kmActual.toLocaleString("es-ES")}).` };
  return { ok: true, km: n };
}

/** La hoja se pide al finalizar la jornada si están activos «jornada», «checklist» y «cierre». */
export const cierreObligatorio = (m: EstadoModulos) => m.jornada && m.checklist && m.cierre;

/** Fila de cierres_jornada tal como la leen la central y el mantenimiento. */
export interface CierreJornada {
  id: string; jornada_id: string; conductor_id: string; vehiculo_id: string; zonas: string[]; tecnico: Tecnico;
  combustible: string; km: number | null; comentario: string; gravedad: GravedadCierre; creado_en: string; visto: boolean;
}

/** Semáforo del último cierre de cada vehículo (para /central/mantenimiento). */
export const SEMAFORO_CIERRE: Record<GravedadCierre, { texto: string; color: "rojo" | "amarillo" | "verde" }> = {
  grave: { texto: "Daños / avería", color: "rojo" }, mantenimiento: { texto: "Mantenimiento", color: "amarillo" }, ok: { texto: "Listo", color: "verde" },
};

/** El último cierre de cada vehículo (los cierres vienen en cualquier orden). */
export function ultimoCierrePorVehiculo<C extends Pick<CierreJornada, "vehiculo_id" | "creado_en">>(cierres: C[]): Map<string, C> {
  const m = new Map<string, C>();
  for (const c of cierres) {
    const prev = m.get(c.vehiculo_id);
    if (!prev || Date.parse(c.creado_en) > Date.parse(prev.creado_en)) m.set(c.vehiculo_id, c);
  }
  return m;
}
