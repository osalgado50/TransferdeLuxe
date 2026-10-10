import { z } from "zod";
import { clienteAdmin } from "@/lib/supabase/admin";
import { datosNoValidos, demasiadas, exigirConductorBearer, leerJson } from "@/lib/supabase/bearer";
import { permitir } from "@/lib/limite";

export const dynamic = "force-dynamic";
const cuerpo = z.object({
  token: z.string().max(200).regex(/^Expo(nent)?PushToken\[[^\]]+\]$/),
  plataforma: z.enum(["ios", "android"]),
});

export async function POST(req: Request) {
  const a = await exigirConductorBearer(req);
  if (!a.ok) return a.res;
  if (!permitir(`app-push:${a.yo.id}`, 10, 60_000)) return demasiadas();
  const b = cuerpo.safeParse(await leerJson(req));
  if (!b.success) return datosNoValidos();
  const { error } = await clienteAdmin().from("dispositivos_push")
    .upsert({ token: b.data.token, conductor_id: a.yo.id, plataforma: b.data.plataforma, actualizado_en: new Date().toISOString() }, { onConflict: "token" });
  if (error) return Response.json({ error: "No se pudo registrar el dispositivo." }, { status: 500 });
  return Response.json({ ok: true });
}
