import Link from "next/link";
import { FILTRO_CONDUCEN } from "@/lib/conductores";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { modulosCentral } from "@/lib/central/modulosConductor";
import { nombreTipoIncidencia, type Incidencia } from "@/lib/dominio/incidencias";
import { BotonResolver } from "@/components/central/BotonResolver";

export const dynamic = "force-dynamic";

export default async function Incidencias({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await exigirRol("operador");
  if (!(await modulosCentral()).incidencias) notFound();
  const todas = (await searchParams).ver === "todas";
  const sb = clienteAdmin();
  let q = sb.from("incidencias").select("*").order("creado_en", { ascending: false }).limit(200);
  if (!todas) q = q.eq("resuelta", false);
  const [{ data, error }, { data: perfiles }] = await Promise.all([q, sb.from("perfiles").select("id,nombre").or(FILTRO_CONDUCEN)]);
  if (error) throw new Error(`Incidencias: ${error.message}`);
  const lista = (data ?? []) as Incidencia[];
  const nombre = (id: string) => perfiles?.find((p) => p.id === id)?.nombre ?? "Conductor";
  const rutas = lista.flatMap((i) => (i.foto_path ? [i.foto_path] : []));
  const { data: firmadas } = rutas.length ? await sb.storage.from("incidencias").createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map<string, string>((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as [string, string]] : [])));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Incidencias</h1>
        <Link href={todas ? "/central/incidencias" : "/central/incidencias?ver=todas"} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm">{todas ? "Ver solo pendientes" : "Ver también resueltas"}</Link>
      </div>
      {lista.length === 0 && <p className="text-slate-400">{todas ? "No hay incidencias." : "No hay incidencias pendientes."}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((i) => (
          <article key={i.id} className={`space-y-2 rounded-xl border bg-slate-900 p-4 ${i.resuelta ? "border-slate-700 opacity-70" : "border-red-600"}`}>
            <p className="font-semibold text-red-300">{nombreTipoIncidencia(i.tipo)} · {nombre(i.conductor_id)}</p>
            <p className="text-xs text-slate-400">
              {new Date(i.creado_en).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}
              {i.servicio_id && <> · <Link className="underline" href={`/central/servicios/${i.servicio_id}`}>ver servicio</Link></>}
              {i.lat != null && i.lng != null && <> · <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lng}#map=17/${i.lat}/${i.lng}`}>ubicación</a></>}
            </p>
            {i.descripcion && <p className="whitespace-pre-wrap text-sm">{i.descripcion}</p>}
            {i.foto_path && url.get(i.foto_path) && (
              <a href={url.get(i.foto_path)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url.get(i.foto_path)} alt={`Foto de la incidencia: ${nombreTipoIncidencia(i.tipo)}`} className="max-h-64 rounded-lg" />
              </a>
            )}
            <BotonResolver id={i.id} resuelta={i.resuelta} />
          </article>
        ))}
      </div>
    </div>
  );
}
