export interface AccionPendiente { idAccion: string; servicioId: string; accion: "salir" | "cargar" | "descargar"; creadaEn: number; intentos?: number }
type Almacen = { get(): string | null; set(v: string): void };
/** Resultado de red: ok=false es un rechazo de negocio (se descarta); lanzar es fallo de red/sesión (se conserva). */
type Enviar = (a: AccionPendiente) => Promise<{ ok: boolean; error?: string }>;
type Resultado = { enviadas: number; errores: string[] };

export class ColaAcciones {
  private enCurso: Promise<Resultado> | null = null;
  constructor(
    private almacen: Almacen,
    private enviar: Enviar,
    private alRechazar?: (a: AccionPendiente, error: string) => void,
  ) {}

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
  private falloRed(idAccion: string) {
    this.guardar(this.pendientes().map((x) => (x.idAccion === idAccion ? { ...x, intentos: (x.intentos ?? 0) + 1 } : x)));
  }
  private quitar(idAccion: string) { this.guardar(this.pendientes().filter((x) => x.idAccion !== idAccion)); }

  vaciar(): Promise<Resultado> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.correr().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }
  private async correr(): Promise<Resultado> {
    const errores: string[] = []; let enviadas = 0;
    for (;;) {
      const a = this.pendientes()[0]; // se relee cada vez: lo encolado durante el envío no se pierde
      if (!a) break;
      let r: { ok: boolean; error?: string };
      try { r = await this.enviar(a); } catch { this.falloRed(a.idAccion); break; }
      if (!r || typeof r.ok !== "boolean") { this.falloRed(a.idAccion); break; } // respuesta inesperada (p. ej. redirección): conservar
      this.quitar(a.idAccion);
      if (r.ok) enviadas++;
      else { const e = r.error ?? "Error"; errores.push(e); this.alRechazar?.(a, e); }
    }
    return { enviadas, errores };
  }
}
