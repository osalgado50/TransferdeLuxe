/**
 * Dictado de direcciones (Web Speech API del navegador, gratuito): limpiar lo reconocido y traducir sus errores.
 * El reconocimiento lo hace el propio navegador; la app solo recibe el texto.
 */

/** «Avinguda Diagonal 200.» → «Avinguda Diagonal 200»: sin espacios de más ni el punto final que añade Safari. */
export function limpiarDictado(t: string): string {
  const s = t.replace(/\s+/g, " ").trim().replace(/[.。…]+$/u, "").trim();
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : "";
}

export type FalloDictado = "permiso" | "noOido" | "otro" | null;
/** Error del reconocimiento → qué decirle al usuario. `aborted` (lo paró él) no es un fallo. */
export function falloDictado(codigo: string): FalloDictado {
  if (codigo === "aborted") return null;
  if (codigo === "not-allowed" || codigo === "service-not-allowed" || codigo === "audio-capture") return "permiso";
  if (codigo === "no-speech") return "noOido";
  return "otro";
}
