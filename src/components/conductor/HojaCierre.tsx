"use client";
import { useEffect, useRef, useState } from "react";
import { cierreConductor } from "@/app/conductor/modulos-actions";
import DiagramaVehiculo from "@/components/comun/DiagramaVehiculo";
import {
  COMBUSTIBLE, ITEMS_TECNICOS, MAX_COMENTARIO, TESTIGOS, alternarZona, gravedadCierre, resumenCierre, tecnicoInicial, validarKm,
  type Combustible, type GravedadCierre, type IdTestigo, type Tecnico,
} from "@/lib/dominio/cierre";

export interface VehiculoCierre { id: string; matricula: string; modelo: string; km_actuales: number }

const COLOR_G: Record<GravedadCierre, string> = {
  grave: "border-red-500 bg-red-950 text-red-100", mantenimiento: "border-amber-500 bg-amber-950 text-amber-100", ok: "border-emerald-500 bg-emerald-950 text-emerald-100",
};

/**
 * Hoja de cierre de jornada (PWA), a pantalla completa en 3 pasos: (1) daños en el diagrama del coche, (2) estado
 * técnico, combustible y km, (3) comentario y «Enviar y cerrar jornada». «Cancelar» no finaliza. Si falla el envío
 * (sin red), lo marcado se conserva y se puede reintentar con el mismo idAccion (sin duplicar).
 */
export default function HojaCierre({ vehiculos, vehiculoInicial, alCancelar, alEnviado }: {
  vehiculos: VehiculoCierre[]; vehiculoInicial: string | null; alCancelar: () => void; alEnviado: (g: GravedadCierre) => void;
}) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [vehiculo, setVehiculo] = useState(vehiculoInicial && vehiculos.some((v) => v.id === vehiculoInicial) ? vehiculoInicial : "");
  const [zonas, setZonas] = useState<string[]>([]);
  const [tecnico, setTecnico] = useState<Tecnico>(tecnicoInicial);
  const [combustible, setCombustible] = useState<Combustible | "">("");
  const [km, setKm] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idAccion = useRef<string>(crypto.randomUUID());
  const arriba = useRef<HTMLDivElement>(null);
  useEffect(() => { arriba.current?.scrollTo({ top: 0 }); setError(null); }, [paso]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) alCancelar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [alCancelar, enviando]);

  const v = vehiculos.find((x) => x.id === vehiculo) ?? null;
  const kmOk = validarKm(km.trim() || null, v?.km_actuales ?? 0);
  const gravedad = gravedadCierre({ zonas, tecnico, combustible: combustible || "lleno" });

  const siguiente = () => {
    if (paso === 1) { if (!vehiculo) { setError("Elige el vehículo."); return; } setPaso(2); return; }
    if (paso === 2) {
      if (!combustible) { setError("Indica el nivel de combustible."); return; }
      if (!kmOk.ok) { setError(kmOk.error); return; }
      setPaso(3);
    }
  };
  const enviar = async () => {
    if (!combustible || !kmOk.ok) return;
    setEnviando(true); setError(null);
    try {
      const r = await cierreConductor({ idAccion: idAccion.current, vehiculo_id: vehiculo, zonas, tecnico, combustible, km: kmOk.km, comentario });
      if (!r.ok) { setError(r.error); return; }
      alEnviado(r.gravedad);
    } catch {
      setError("Sin conexión. Lo marcado se conserva: pulsa «Reintentar» cuando tengas cobertura.");
    } finally { setEnviando(false); }
  };
  const tec = (id: keyof Tecnico, valor: string) => setTecnico((t) => ({ ...t, [id]: valor }));
  const testigo = (id: IdTestigo) => setTecnico((t) => {
    const l = t.testigos ?? [];
    return { ...t, testigos: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] };
  });
  const opcion = (activa: boolean, tono: "ok" | "malo") =>
    `min-h-12 flex-1 rounded-xl border-2 px-3 text-base font-bold ${activa ? (tono === "ok" ? "border-emerald-500 bg-emerald-600 text-white" : "border-red-500 bg-red-600 text-white") : "border-slate-600 bg-slate-900 text-slate-200"}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Hoja de cierre del vehículo" className="fixed inset-0 z-50 flex flex-col bg-marca-fondo text-slate-100">
      <header className="flex items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-marca-claro">Cierre de jornada</h2>
          <p className="text-xs text-slate-400">Paso {paso} de 3 · {paso === 1 ? "Daños del vehículo" : paso === 2 ? "Estado técnico" : "Comentario y envío"}</p>
        </div>
        <button type="button" onClick={alCancelar} disabled={enviando} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm">Cancelar</button>
      </header>

      <div ref={arriba} className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-lg space-y-4">
          {paso === 1 && (
            <>
              <label className="block text-sm">Vehículo
                <select value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-2">
                  <option value="">Elige…</option>
                  {vehiculos.map((x) => <option key={x.id} value={x.id}>{x.matricula} · {x.modelo}</option>)}
                </select>
              </label>
              <p className="text-sm text-slate-300">Toca las zonas que se han dañado <strong>hoy</strong> (se marcan en rojo). Si no hay daños, pulsa «Hecho».</p>
              <DiagramaVehiculo zonas={zonas} alAlternar={(id) => setZonas((z) => alternarZona(z, id))} />
              <p className="text-sm text-slate-400" aria-live="polite">{zonas.length ? `${zonas.length} zona${zonas.length > 1 ? "s" : ""} marcada${zonas.length > 1 ? "s" : ""}` : "Sin daños marcados"}</p>
            </>
          )}

          {paso === 2 && (
            <>
              <ul className="space-y-3">
                {ITEMS_TECNICOS.map((i) => (
                  <li key={i.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                    <p className="font-semibold">{i.etiqueta}</p>
                    {i.ayuda && <p className="text-xs text-slate-400">{i.ayuda}</p>}
                    <div className="mt-2 flex gap-2">
                      <button type="button" aria-pressed={tecnico[i.id] === "ok"} onClick={() => tec(i.id, "ok")} className={opcion(tecnico[i.id] === "ok", "ok")}>{i.textoOk}</button>
                      <button type="button" aria-pressed={tecnico[i.id] !== "ok"} onClick={() => tec(i.id, i.malo)} className={opcion(tecnico[i.id] !== "ok", "malo")}>{i.textoMalo}</button>
                    </div>
                    {i.id === "testigos_cuadro" && tecnico.testigos_cuadro !== "ok" && (
                      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Qué testigo">
                        {TESTIGOS.map((t) => {
                          const on = (tecnico.testigos ?? []).includes(t.id);
                          return <button key={t.id} type="button" aria-pressed={on} onClick={() => testigo(t.id)}
                            className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${on ? "border-red-500 bg-red-600 text-white" : "border-slate-600"}`}>Testigo de {t.etiqueta}</button>;
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <fieldset className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                <legend className="px-1 font-semibold">Combustible</legend>
                <div className="grid grid-cols-5 gap-1.5">
                  {COMBUSTIBLE.map((c) => (
                    <button key={c.id} type="button" aria-pressed={combustible === c.id} onClick={() => setCombustible(c.id)}
                      className={`min-h-12 rounded-xl border-2 text-sm font-bold ${combustible === c.id ? (c.id === "reserva" ? "border-amber-500 bg-amber-600 text-white" : "border-marca-claro bg-marca text-white") : "border-slate-600"}`}>{c.etiqueta}</button>
                  ))}
                </div>
              </fieldset>
              <label className="block rounded-xl border border-slate-700 bg-slate-900 p-3 font-semibold">Km del cuentakilómetros (opcional)
                <input type="number" inputMode="numeric" min={v?.km_actuales ?? 0} step={1} value={km} onChange={(e) => setKm(e.target.value)}
                  placeholder={v ? `≥ ${v.km_actuales.toLocaleString("es-ES")}` : ""} className="mt-2 min-h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-lg font-normal" />
              </label>
            </>
          )}

          {paso === 3 && (
            <>
              <p className={`rounded-xl border-2 p-3 font-semibold ${COLOR_G[gravedad]}`}>{resumenCierre({ zonas, tecnico, combustible: combustible || "lleno", matricula: v?.matricula })}</p>
              <label className="block text-sm font-semibold">Comentario para la central (opcional)
                <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={MAX_COMENTARIO} rows={5}
                  placeholder="Ej.: rozadura en el portón al aparcar en el aeropuerto" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-base font-normal" />
              </label>
              <p className="text-right text-xs text-slate-500">{comentario.length}/{MAX_COMENTARIO}</p>
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
        </div>
      </div>

      <footer className="border-t border-slate-700 px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-lg gap-3">
          {paso === 1
            ? <button type="button" onClick={() => setZonas([])} disabled={!zonas.length} className="min-h-14 flex-1 rounded-xl border-2 border-slate-500 text-lg font-semibold disabled:opacity-40">Borrar todo</button>
            : <button type="button" onClick={() => setPaso((p) => (p === 3 ? 2 : 1))} disabled={enviando} className="min-h-14 flex-1 rounded-xl border-2 border-slate-500 text-lg font-semibold">Atrás</button>}
          {paso < 3
            ? <button type="button" onClick={siguiente} className={`min-h-14 flex-1 rounded-xl text-lg font-bold text-white ${paso === 1 ? "bg-red-600 hover:bg-red-500" : "bg-marca hover:bg-marca-oscuro"}`}>{paso === 1 ? "Hecho" : "Siguiente"}</button>
            : <button type="button" onClick={enviar} disabled={enviando} className="min-h-14 flex-[2] rounded-xl bg-red-600 text-lg font-bold text-white hover:bg-red-500 disabled:opacity-60">{enviando ? "Enviando…" : error ? "Reintentar" : "Enviar y cerrar jornada"}</button>}
        </div>
      </footer>
    </div>
  );
}
