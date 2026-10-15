// PostgREST (Supabase) devuelve como mucho 1000 filas por consulta aunque se pida `.limit(50000)`: para leerlo TODO hay
// que pedir páginas con `.range(desde, hasta)` (con un orden estable) hasta que una venga incompleta.

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Lee todas las páginas de `tam` filas (`pagina(desde, hasta)` con índices inclusivos). Lanza si alguna falla. */
export async function leerTodasLasPaginas<T>(pagina: (desde: number, hasta: number) => Pagina<T>, tam = 1000, maxPaginas = 500): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPaginas; i++) {
    const { data, error } = await pagina(i * tam, i * tam + tam - 1);
    if (error) throw new Error(error.message);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < tam) return out;
  }
  throw new Error(`Demasiadas filas (más de ${maxPaginas * tam}).`);
}
