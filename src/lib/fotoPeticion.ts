import "server-only";

const MAX = 5 * 1024 * 1024;
type Lectura = { ok: true; foto: File } | { ok: false; res: Response };
const mal = (error: string, status: number): Lectura => ({ ok: false, res: Response.json({ error }, { status }) });

/**
 * Foto de una petición de la app: JSON `{ foto_base64 }` (recomendado: el proxy de Hostinger estropea las subidas
 * multipart troceadas que hace el iPhone) o multipart clásico con el campo `foto` (web y apps antiguas).
 */
export async function leerFotoDePeticion(req: Request): Promise<Lectura> {
  const largo = Number(req.headers.get("content-length"));
  if (largo > Math.ceil(MAX * 1.4) + 1024 * 1024) return mal("La foto pesa más de 5 MB", 413);
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    let b64: unknown;
    try { b64 = ((await req.json()) as { foto_base64?: unknown } | null)?.foto_base64; } catch { return mal("Falta la foto", 400); }
    if (typeof b64 !== "string" || !b64) return mal("Falta la foto", 400);
    const bytes = Buffer.from(b64.replace(/^data:[^,]*,/, ""), "base64");
    if (!bytes.length) return mal("Falta la foto", 400);
    if (bytes.length > MAX) return mal("La foto pesa más de 5 MB", 400);
    return { ok: true, foto: new File([bytes], "foto.jpg", { type: "application/octet-stream" }) };
  }
  if (!largo) return mal("Falta el tamaño de la petición", 411);
  let foto: FormDataEntryValue | null;
  try { foto = (await req.formData()).get("foto"); } catch { return mal("Falta la foto", 400); }
  if (!(foto instanceof File)) return mal("Falta la foto", 400);
  return { ok: true, foto };
}
