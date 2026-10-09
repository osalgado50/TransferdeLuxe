/** IP del cliente para el límite de uso: x-real-ip; si no, la ÚLTIMA entrada de x-forwarded-for
 *  (la añade nuestro proxy inverso; las anteriores las controla el cliente); si no, "local". */
export function ipCliente(h: { get(n: string): string | null }): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const ultima = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return ultima || "local";
}
