const golpes = new Map<string, number[]>();
export function permitir(clave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const lista = (golpes.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (lista.length >= max) { golpes.set(clave, lista); return false; }
  lista.push(ahora); golpes.set(clave, lista); return true;
}
