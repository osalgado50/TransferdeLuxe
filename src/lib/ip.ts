/** IP del cliente para el límite de uso: la ÚLTIMA entrada de x-forwarded-for, que añade el proxy de Hostinger (las
 *  anteriores las controla el cliente); si no hay, "local". No se usa x-real-ip: Hostinger la deja pasar tal cual y
 *  con una inventada en cada petición se saltaban todos los límites (comprobado en producción el 17/10/2026). */
export function ipCliente(h: { get(n: string): string | null }): string {
  const ultima = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return ultima || "local";
}
