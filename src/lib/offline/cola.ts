import { esperaBackoff } from "@/lib/dominio/reintento";

export interface AccionPendiente {
  idAccion: string; servicioId: string; accion: "salir" | "cargar" | "descargar" | "deshacer" | "devolver" | "rechazar"; creadaEn: number; intentos?: number;
  /** «devolver» («No puedo hacer este servicio») y «rechazar» (fin de jornada): motivo elegido por el conductor. */
  motivo?: string;
  /** Tras un fallo de red/servidor no se reintenta antes de este instante (backoff exponencial con tope). */
  proximoIntento?: number;
}
type Almacen = { get(): string | null; set(v: string): void };
/** Resultado de red: ok=false es un rechazo de negocio (se descarta); lanzar es fallo de red/sesión (se conserva). */
type Enviar = (a: AccionPendiente) => Promise<{ ok: boolean; error?: string }>;
/** `omitida`: no se intentó (aún dentro del backoff). `esperaMs`: hay pendientes que no se han podido enviar; el próximo intento automático será dentro de ese tiempo. */
type Resultado = { enviadas: number; errores: string[]; esperaMs?: number; omitida?: true };
export interface OpcionesCola { ahora?: () => number; espera?: (intentos: number) => number }

export class ColaAcciones {
  private enCurso: Promise<Resultado> | null = null;
  constructor(
    private almacen: Almacen,
    private enviar: Enviar,
    private alRechazar?: (a: AccionPendiente, error: string) => void,
    private opciones: OpcionesCola = {},
  ) {}
  private ahora() { return (this.opciones.ahora ?? Date.now)(); }

  pendientes(): AccionPendiente[] {
    try {
      const v = JSON.parse(this.almacen.get() ?? "[]");
      return Array.isArray(v) ? v.filter((x) => x && typeof x.idAccion === "string" && typeof x.servicioId === "string") : [];
    } catch { return []; }
  }
  private guardar(l: AccionPendiente[]) { this.almacen.set(JSON.stringify(l)); }
  encolar(a: Omit<AccionPendiente, "creadaEn">) { this.guardar([...this.pendientes(), { ...a, creadaEn: Date.now() }]); }
  /** Descarta una acción atascada (p. ej. se queda a la cabeza reintentándose sin éxito). */
  descartar(idAccion: string) { this.quitar(idAccion); }
  /** Fallo transitorio: suma un intento y fija el próximo (2 s, 4 s, 8 s… hasta 5 min; o lo que pida Retry-After). */
  private falloRed(idAccion: string, error?: unknown): number {
    let ms = 0;
    this.guardar(this.pendientes().map((x) => {
      if (x.idAccion !== idAccion) return x;
      const intentos = (x.intentos ?? 0) + 1;
      const pedido = typeof (error as { reintentarEnMs?: unknown })?.reintentarEnMs === "number" ? (error as { reintentarEnMs: number }).reintentarEnMs : 0;
      ms = Math.max((this.opciones.espera ?? esperaBackoff)(intentos), pedido);
      return { ...x, intentos, proximoIntento: this.ahora() + ms };
    }));
    return ms;
  }
  private quitar(idAccion: string) { this.guardar(this.pendientes().filter((x) => x.idAccion !== idAccion)); }

  /**
   * Envía lo pendiente en orden. Sin `forzar`, respeta el backoff de la acción de cabeza (no golpea al servidor
   * en caliente). `forzar` = gesto del usuario o recuperación de la red/servidor: intenta ya.
   */
  vaciar(forzar = false): Promise<Resultado> {
    if (this.enCurso) return this.enCurso;
    const cabeza = this.pendientes()[0];
    if (!forzar && cabeza?.proximoIntento && cabeza.proximoIntento > this.ahora()) {
      return Promise.resolve({ enviadas: 0, errores: [], esperaMs: cabeza.proximoIntento - this.ahora(), omitida: true });
    }
    this.enCurso = this.correr().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }
  private async correr(): Promise<Resultado> {
    const errores: string[] = []; let enviadas = 0;
    for (;;) {
      const a = this.pendientes()[0]; // se relee cada vez: lo encolado durante el envío no se pierde
      if (!a) break;
      let r: { ok: boolean; error?: string };
      try { r = await this.enviar(a); } catch (e) { return { enviadas, errores, esperaMs: this.falloRed(a.idAccion, e) }; }
      if (!r || typeof r.ok !== "boolean") return { enviadas, errores, esperaMs: this.falloRed(a.idAccion) }; // respuesta inesperada (p. ej. redirección): conservar
      this.quitar(a.idAccion);
      if (r.ok) enviadas++;
      else { const e = r.error ?? "Error"; errores.push(e); this.alRechazar?.(a, e); }
    }
    return { enviadas, errores };
  }
}
