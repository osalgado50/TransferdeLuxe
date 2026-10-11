export type TipoImagen = "image/jpeg" | "image/png" | "image/webp";

const EXT: Record<TipoImagen, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Detecta el tipo real por los primeros bytes (magic bytes). HEIC no se admite hoy. */
export function detectarTipoImagen(b: Uint8Array): TipoImagen | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const txt = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length >= 12 && txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP") return "image/webp";
  return null;
}

export const extensionDe = (t: TipoImagen) => EXT[t];
