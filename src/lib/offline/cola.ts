export interface AccionPendiente { idAccion: string; servicioId: string; accion: "salir" | "cargar" | "descargar"; creadaEn: number }
type Almacen = { get(): string | null; set(v: string): void };
type Enviar = (a: AccionPendiente) => Promise<{ ok: boolean; error?: string }>;

export class ColaAcciones {
  constructor(private almacen: Almacen, private enviar: Enviar) {}
  pendientes(): AccionPendiente[] { try { return JSON.parse(this.almacen.get() ?? "[]"); } catch { return []; } }
  private guardar(l: AccionPendiente[]) { this.almacen.set(JSON.stringify(l)); }
  encolar(a: Omit<AccionPendiente, "creadaEn">) { this.guardar([...this.pendientes(), { ...a, creadaEn: Date.now() }]); }
  async vaciar() {
    const errores: string[] = []; let enviadas = 0;
    let cola = this.pendientes();
    while (cola.length) {
      const [a, ...resto] = cola;
      let r: { ok: boolean; error?: string };
      try { r = await this.enviar(a); } catch { break; }
      if (r.ok) enviadas++; else errores.push(r.error ?? "Error");
      cola = resto; this.guardar(cola);
    }
    return { enviadas, errores };
  }
}
