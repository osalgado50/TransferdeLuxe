import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin } from "@/lib/supabase/admin";
import { fotosHuerfanas, type ObjetoStorage } from "@/lib/dominio/huerfanas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGINA = 1000;
const MAX_BORRADOS = 500; // por pasada: un error de lógica nunca puede vaciar un bucket de golpe

/** Bucket → tablas y columnas que referencian sus fotos (los tickets anulados conservan su foto: cuentan). */
const BUCKETS: Record<string, { tabla: string; columna: string }[]> = {
  tickets: [{ tabla: "tickets_combustible", columna: "foto_path" }],
  incidencias: [{ tabla: "incidencias", columna: "foto_path" }, { tabla: "checklist_revisiones", columna: "foto_path" }],
};

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Todos los objetos del bucket (carpeta del conductor → fotos), con su fecha de creación. */
async function listar(sb: SupabaseClient, bucket: string): Promise<ObjetoStorage[]> {
  const st = sb.storage.from(bucket);
  const leer = async (prefijo: string) => {
    const out: { name: string; id: string | null; created_at: string | null }[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await st.list(prefijo, { limit: PAGINA, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`Storage ${bucket}/${prefijo}: ${error.message}`);
      out.push(...(data ?? []));
      if ((data ?? []).length < PAGINA) return out;
    }
  };
  const objetos: ObjetoStorage[] = [];
  for (const e of await leer("")) {
    if (e.id) { objetos.push({ path: e.name, creado: e.created_at }); continue; } // fichero suelto en la raíz
    for (const f of await leer(e.name)) if (f.id) objetos.push({ path: `${e.name}/${f.name}`, creado: f.created_at });
  }
  return objetos;
}

/** Rutas referenciadas por alguna fila. Si una lectura falla, se lanza: sin la lista completa no se borra nada. */
async function referenciadas(sb: SupabaseClient, refs: { tabla: string; columna: string }[]): Promise<Set<string>> {
  const set = new Set<string>();
  for (const { tabla, columna } of refs) {
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await sb.from(tabla).select(`id,${columna}`).not(columna, "is", null).order("id").range(desde, desde + PAGINA - 1);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) if (typeof r[columna] === "string") set.add(r[columna] as string);
      if ((data ?? []).length < PAGINA) break;
    }
  }
  return set;
}

/**
 * Cron: borra de Storage (buckets `tickets` e `incidencias`) las fotos de más de 24 h que ninguna fila referencia
 * (subidas cuyo formulario no se llegó a guardar). `Authorization: Bearer $CRON_SECRET`. `?simular=1` solo las lista.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !iguales(req.headers.get("authorization") ?? "", `Bearer ${secreto}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  const sb = clienteAdmin();
  const ahora = new Date();
  const resultado: Record<string, { objetos: number; huerfanas: number; borradas: number; rutas?: string[] }> = {};
  try {
    for (const [bucket, refs] of Object.entries(BUCKETS)) {
      const [objetos, usadas] = await Promise.all([listar(sb, bucket), referenciadas(sb, refs)]);
      const huerfanas = fotosHuerfanas(objetos, usadas, ahora);
      const aBorrar = huerfanas.slice(0, MAX_BORRADOS);
      let borradas = 0;
      if (!simular && aBorrar.length) {
        const { data, error } = await sb.storage.from(bucket).remove(aBorrar);
        if (error) throw new Error(`Borrar en ${bucket}: ${error.message}`);
        borradas = (data ?? []).length;
      }
      resultado[bucket] = { objetos: objetos.length, huerfanas: huerfanas.length, borradas, ...(simular ? { rutas: aBorrar } : {}) };
    }
    return NextResponse.json({ ok: true, simular, ...resultado });
  } catch (e) {
    console.error("Limpiar fotos:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron limpiar las fotos", ...resultado }, { status: 500 });
  }
}
