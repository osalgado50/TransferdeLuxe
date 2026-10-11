"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { crearFreno } from "@/lib/dominio/reintento";
import { leerModulos } from "@/lib/dominio/modulos";
import { nombreTipoIncidencia } from "@/lib/dominio/incidencias";
import { fallos, type ItemChecklist, type Respuestas } from "@/lib/dominio/checklist";

interface Inc { id: string; conductor_id: string; tipo: string; descripcion: string; creado_en: string }
interface Rev { id: string; conductor_id: string; vehiculo_id: string; respuestas: Respuestas; observaciones: string; creado_en: string }

/** Alertas de los módulos del conductor (incidencias sin resolver y checklists con fallos), en vivo. `alNuevo`: opcional. */
export default function AlertasModulos({ conductores, vehiculos, alNuevo }: {
  conductores: { id: string; nombre: string }[]; vehiculos: { id: string; matricula: string }[]; alNuevo?: () => void;
}) {
  const [inc, setInc] = useState<Inc[]>([]);
  const [revs, setRevs] = useState<Rev[]>([]);
  const [items, setItems] = useState<ItemChecklist[]>([]);
  const vistos = useRef<Set<string> | null>(null);
  const aviso = useRef(alNuevo);
  useEffect(() => { aviso.current = alNuevo; });

  const cargar = useCallback(async () => {
    const sb = clienteNavegador();
    const { data: aj } = await sb.from("ajustes").select("modulos").eq("id", 1).maybeSingle();
    const m = leerModulos(aj?.modulos);
    const [i, r, it] = await Promise.all([
      m.incidencias ? sb.from("incidencias").select("id,conductor_id,tipo,descripcion,creado_en").eq("resuelta", false).order("creado_en", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      m.checklist ? sb.from("checklist_revisiones").select("id,conductor_id,vehiculo_id,respuestas,observaciones,creado_en").eq("revisada", false).order("creado_en", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      m.checklist ? sb.from("checklist_items").select("id,texto,orden,activo") : Promise.resolve({ data: [] }),
    ]);
    const ni = (i.data ?? []) as Inc[], nr = (r.data ?? []) as Rev[];
    const claves = new Set([...ni.map((x) => x.id), ...nr.map((x) => x.id)]);
    if (vistos.current && [...claves].some((k) => !vistos.current!.has(k))) aviso.current?.();
    vistos.current = claves;
    setInc(ni); setRevs(nr); setItems((it.data ?? []) as ItemChecklist[]);
  }, []);

  useEffect(() => {
    void cargar();
    const sb = clienteNavegador();
    // Ráfagas de cambios (p. ej. varias revisiones seguidas): como mucho una recarga (4 consultas) cada 3 s.
    const freno = crearFreno(3000);
    const recargar = () => freno.pedir(() => void cargar());
    let canal: ReturnType<typeof sb.channel> | null = null, cancelado = false;
    void sb.auth.getSession().then(({ data }) => {
      if (cancelado) return;
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      canal = sb.channel(`rt-modulos-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "incidencias" }, recargar)
        .on("postgres_changes", { event: "*", schema: "public", table: "checklist_revisiones" }, recargar)
        .subscribe();
    });
    const t = setInterval(() => void cargar(), 60_000); // respaldo si el socket se cae
    return () => { cancelado = true; clearInterval(t); freno.cancelar(); if (canal) void sb.removeChannel(canal); };
  }, [cargar]);

  const nombre = (id: string) => conductores.find((c) => c.id === id)?.nombre ?? "conductor";
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      {inc.map((i) => (
        <article key={i.id} data-alerta="Incidencia" className="rounded-xl border border-red-600 bg-slate-900 p-3">
          <p className="text-sm font-medium text-red-300">Incidencia: {nombreTipoIncidencia(i.tipo)} · {nombre(i.conductor_id)}</p>
          <p className="text-xs text-slate-400">{hora(i.creado_en)}{i.descripcion ? ` · ${i.descripcion.slice(0, 120)}` : ""}</p>
          <Link href="/central/incidencias" className="mt-2 inline-block rounded-lg border border-slate-600 px-3 py-2 text-sm">Ver incidencias</Link>
        </article>
      ))}
      {revs.map((r) => (
        <article key={r.id} data-alerta="Checklist" className="rounded-xl border border-amber-600 bg-slate-900 p-3">
          <p className="text-sm font-medium text-amber-300">Checklist con fallos · {nombre(r.conductor_id)} · {vehiculos.find((v) => v.id === r.vehiculo_id)?.matricula ?? "vehículo"}</p>
          <p className="text-xs text-slate-400">{hora(r.creado_en)} · Mal: {fallos(r.respuestas, items).join(", ") || "—"}{r.observaciones ? ` · ${r.observaciones.slice(0, 120)}` : ""}</p>
          <Link href="/central/checklist" className="mt-2 inline-block rounded-lg border border-slate-600 px-3 py-2 text-sm">Revisar</Link>
        </article>
      ))}
    </>
  );
}
