"use client";
import { useEffect, useState } from "react";
import LogoMarca from "@/components/comun/LogoMarca";
import MapaSeguimiento from "./MapaSeguimientoCarga";
import { REFRESCO_SEGUIMIENTO_MS, TEXTOS_SEGUIMIENTO, type IdiomaSeguimiento, type Seguimiento } from "@/lib/dominio/seguimiento";

const COLOR: Record<Seguimiento["estado"], string> = {
  asignando: "bg-slate-700", confirmado: "bg-marca", de_camino: "bg-marca", llegando: "bg-green-600", a_bordo: "bg-green-700",
  finalizado: "bg-slate-700", cancelado: "bg-red-700",
};
const FINALES = new Set(["finalizado", "cancelado"]);

/** Seguimiento en directo para el cliente: refresca cada 15 s (se para si la pestaña está oculta o ya terminó). */
export default function PanelSeguimiento({ token, idioma, inicial, caducado: caducadoInicial }: {
  token: string; idioma: IdiomaSeguimiento; inicial: Seguimiento | null; caducado: boolean;
}) {
  const t = TEXTOS_SEGUIMIENTO[idioma];
  const [datos, setDatos] = useState<Seguimiento | null>(inicial);
  const [caducado, setCaducado] = useState(caducadoInicial);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (caducado) return;
    let vivo = true;
    const leer = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch(`/api/s/${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 410 || r.status === 404) { setCaducado(true); return; }
        if (!r.ok) { setError(true); return; }
        setDatos((await r.json()) as Seguimiento);
        setError(false);
      } catch { if (vivo) setError(true); }
    };
    if (!inicial) void leer();
    const id = setInterval(() => void leer(), REFRESCO_SEGUIMIENTO_MS);
    const visible = () => { if (document.visibilityState === "visible") void leer(); };
    document.addEventListener("visibilitychange", visible);
    return () => { vivo = false; clearInterval(id); document.removeEventListener("visibilitychange", visible); };
  }, [token, caducado, inicial]);

  const hora = (iso: string) => new Date(iso).toLocaleTimeString(idioma === "en" ? "en-GB" : "es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  const e = datos ? t[datos.estado] : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="flex items-center gap-3">
          <LogoMarca alto={40} soloEmblema />
          <span className="text-lg font-semibold text-marca-claro">TransferdeLuxe</span>
        </header>
        {caducado ? (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
            <h1 className="text-xl font-semibold">{t.caducado}</h1>
            <p className="mt-1 text-sm text-slate-400">{t.caducadoSub}</p>
          </section>
        ) : !datos || !e ? (
          <section className="h-40 animate-pulse rounded-2xl bg-slate-900" aria-busy="true" />
        ) : (
          <>
            <section className={`rounded-2xl p-5 text-white ${COLOR[datos.estado]}`} aria-live="polite">
              <h1 className="text-2xl font-bold">{e.titulo}</h1>
              <p className="mt-1 text-sm opacity-90">{e.sub}</p>
              {datos.eta && (
                <p className="mt-3 text-lg font-semibold">
                  {datos.eta.objetivo === "destino" ? t.destino : t.llegada}: <span className="text-3xl font-black tabular-nums">{datos.eta.hora}</span>
                  <span className="ml-2 text-sm font-normal opacity-90">(~{datos.eta.minutos} min)</span>
                </p>
              )}
            </section>
            {datos.posicion
              ? <MapaSeguimiento lat={datos.posicion.lat} lng={datos.posicion.lng} etiqueta={datos.vehiculo?.matricula ?? "🚐"} />
              : !FINALES.has(datos.estado) && datos.estado !== "asignando" && datos.estado !== "confirmado" && (
                <p className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-center text-sm text-slate-400">{t.sinSenal}</p>
              )}
            {(datos.conductor || datos.vehiculo) && (
              <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm">
                {datos.conductor && <div><dt className="text-slate-400">{t.conductor}</dt><dd className="text-lg font-semibold">{datos.conductor}</dd></div>}
                {datos.vehiculo && (
                  <div><dt className="text-slate-400">{t.vehiculo}</dt>
                    <dd className="font-semibold">{datos.vehiculo.modelo}{datos.vehiculo.matricula && <span className="mt-1 block w-fit rounded border border-slate-500 px-2 font-mono text-base tracking-wider">{datos.vehiculo.matricula}</span>}</dd></div>
                )}
              </dl>
            )}
            <p className="text-center text-xs text-slate-500">
              {error ? t.error : FINALES.has(datos.estado) ? `${t.actualizado} ${hora(datos.actualizado)}` : `${t.enDirecto} · ${t.actualizado} ${hora(datos.actualizado)}`}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
