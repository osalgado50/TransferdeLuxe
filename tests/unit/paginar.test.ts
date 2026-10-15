import { expect, test } from "vitest";
import { leerTodasLasPaginas } from "@/lib/dominio/paginar";

const tabla = Array.from({ length: 2345 }, (_, i) => i);
const fuente = (filas: number[]) => {
  const pedidas: [number, number][] = [];
  const pagina = async (a: number, b: number) => { pedidas.push([a, b]); return { data: filas.slice(a, b + 1), error: null }; };
  return { pagina, pedidas };
};

test("lee más de 1000 filas pidiendo páginas con range hasta una incompleta", async () => {
  const f = fuente(tabla);
  expect(await leerTodasLasPaginas(f.pagina)).toEqual(tabla);
  expect(f.pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
});
test("justo 1000: una página vacía al final; vacío: una sola petición", async () => {
  const f = fuente(tabla.slice(0, 1000));
  expect(await leerTodasLasPaginas(f.pagina)).toHaveLength(1000);
  expect(f.pedidas).toHaveLength(2);
  const g = fuente([]);
  expect(await leerTodasLasPaginas(g.pagina)).toEqual([]);
  expect(g.pedidas).toHaveLength(1);
});
test("un error en cualquier página se propaga; tope de páginas", async () => {
  await expect(leerTodasLasPaginas(async (a) => (a ? { data: null, error: { message: "caído" } } : { data: [1, 2], error: null }), 2)).rejects.toThrow("caído");
  await expect(leerTodasLasPaginas(async () => ({ data: [1, 2], error: null }), 2, 3)).rejects.toThrow(/Demasiadas/);
});
