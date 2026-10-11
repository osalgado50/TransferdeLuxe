/** Caché en memoria con caducidad por entrada y tamaño acotado (lo más viejo sale primero). Sin dependencias. */
export class CacheTtl<V> {
  private m = new Map<string, { v: V; hasta: number }>();
  constructor(private max = 1000, private ahora: () => number = () => Date.now()) {}

  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.hasta <= this.ahora()) { this.m.delete(k); return undefined; }
    return e.v;
  }
  set(k: string, v: V, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.m.delete(k); // reinsertar = más reciente
    this.m.set(k, { v, hasta: this.ahora() + ttlMs });
    if (this.m.size > this.max) {
      this.purgar();
      for (const clave of this.m.keys()) { if (this.m.size <= this.max) break; this.m.delete(clave); }
    }
  }
  purgar(): void { const t = this.ahora(); for (const [k, e] of this.m) if (e.hasta <= t) this.m.delete(k); }
  vaciar(): void { this.m.clear(); }
  get tamano(): number { return this.m.size; }
}

/** `exp` (segundos) del payload de un JWT, SIN verificar la firma (solo para acotar la caché o descartar caducados). */
export function expDeJwt(jwt: string): number | null {
  const partes = jwt.split(".");
  if (partes.length !== 3) return null;
  try {
    const json = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: unknown };
    return typeof json.exp === "number" && Number.isFinite(json.exp) ? json.exp : null;
  } catch { return null; }
}
