"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarAutoasignacion, prepararAutoasignacion, proponerAutoasignacion } from "@/app/central/autoasignar-actions";
import { colorMargen, evaluarAsignacion, ESTRATEGIAS, type Estrategia } from "@/lib/dominio/autoasignacion";

type Datos = Awaited<ReturnType<typeof prepararAutoasignacion>>;
type Resultado = Awaited<ReturnType<typeof proponerAutoasignacion>>;
type Confirmado = Awaited<ReturnType<typeof confirmarAutoasignacion>>;

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const hhmm = (t: number | string | null) => (t == null ? "—" : hora.format(new Date(t)));
const COLOR = { verde: "bg-green-900/60 text-green-300", naranja: "bg-amber-900/60 text-amber-300", rojo: "bg-red-900/60 text-red-300", gris: "bg-slate-800 text-slate-400" };
const CONEXION = { en_linea: "bg-green-900/60 text-green-300", sin_senal: "bg-red-900/60 text-red-300", fuera: "bg-slate-800 text-slate-400" };
const boton = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";

/** Botón «⚡ Asignar automáticamente» + diálogo: configurar → propuesta editable → confirmar y enviar. */
export default function DialogoAutoasignar({ dia }: { dia?: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [diaSel, setDiaSel] = useState(dia ?? "");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [servs, setServs] = useState<Set<string>>(new Set());
  const [conds, setConds] = useState<Set<string>>(new Set());
  const [estrategia, setEstrategia] = useState<Estrategia>("equitativo");
  const [margen, setMargen] = useState(15);
  const [res, setRes] = useState<Resultado | null>(null);
  const [asign, setAsign] = useState<Record<string, string | null>>({});
  const [forzar, setForzar] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState("");
  const [hecho, setHecho] = useState<Confirmado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pend, ini] = useTransition();

  const cargar = (d?: string) => {
    setDatos(null); setRes(null); setHecho(null); setError(null);
    ini(async () => {
      try {
        const x = await prepararAutoasignacion(d || undefined);
        setDatos(x); setDiaSel(x.dia); setMargen(x.margenMinimo);
        setServs(new Set(x.pendientes.filter((p) => p.marcado).map((p) => p.id)));
        setConds(new Set(x.conductores.filter((c) => c.marcado).map((c) => c.id)));
      } catch { setError("No se pudieron cargar los datos"); }
    });
  };
  const abrir = () => { setAbierto(true); cargar(dia); };
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [abierto]);

  const calcular = () => {
    setError(null);
    ini(async () => {
      try {
        const r = await proponerAutoasignacion({ dia: diaSel, servicioIds: [...servs], conductorIds: [...conds], estrategia, margenMinimo: margen });
        setRes(r); setForzar(new Set()); setLote(crypto.randomUUID());
        setAsign(Object.fromEntries(r.propuesta.lineas.map((l) => [l.servicioId, l.conductorId])));
      } catch { setError("No se pudo calcular la propuesta"); }
    });
  };
  // Motivos originales de lo que no se pudo asignar (se conservan al reevaluar cambios a mano).
  const motivos = useMemo(() => Object.fromEntries((res?.propuesta.lineas ?? []).filter((l) => !l.conductorId)
    .map((l) => [l.servicioId, { motivo: l.motivoSiNo ?? "Sin asignar", subcontratar: l.subcontratar }])), [res]);
  const evaluada = useMemo(() => (res ? evaluarAsignacion(res.entrada, asign, motivos) : null), [res, asign, motivos]);
  const asignadas = evaluada?.lineas.filter((l) => l.conductorId) ?? [];
  const fuera = evaluada?.lineas.filter((l) => !l.conductorId) ?? [];
  const aEnviar = asignadas.filter((l) => l.ok || forzar.has(l.servicioId));

  const confirmar = () => {
    setError(null);
    ini(async () => {
      try {
        const r = await confirmarAutoasignacion({ lote, margenMinimo: res!.entrada.margenMinimoMin,
          lineas: aEnviar.map((l) => ({ servicioId: l.servicioId, conductorId: l.conductorId!, forzar: !l.ok || undefined })) });
        setHecho(r); router.refresh();
      } catch { setError("No se pudo confirmar. Puedes reintentar: no se duplica nada."); }
    });
  };

  const nombre = (id: string) => res?.conductores[id]?.nombre ?? id;
  const selector = (sid: string, valor: string | null) => (
    <select aria-label="Conductor" value={valor ?? ""} disabled={!!hecho}
      onChange={(e) => setAsign((a) => ({ ...a, [sid]: e.target.value || null }))}
      className="min-h-10 w-full min-w-32 rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm">
      <option value="">— Sin asignar —</option>
      {Object.values(res?.conductores ?? {}).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
  );
  const alternar = (s: Set<string>, id: string) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  return (
    <>
      <button type="button" onClick={abrir} data-accion="autoasignar"
        className="inline-flex min-h-11 items-center rounded-lg border border-marca-claro px-4 py-2 font-medium text-marca-claro hover:bg-marca-claro hover:text-slate-950">
        ⚡ Asignar automáticamente
      </button>
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="Asignar automáticamente" onClick={() => setAbierto(false)}
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:rounded-2xl sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-marca-claro">⚡ Asignar automáticamente</h2>
              <button type="button" onClick={() => setAbierto(false)} className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm">Cerrar</button>
            </div>
            {error && <p role="alert" className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">{error}</p>}

            {hecho ? (
              <div className="space-y-3" data-testid="resultado-autoasignar">
                <p className="text-lg"><b className="text-green-300">{hecho.asignados}</b> asignados · <b className="text-amber-300">{hecho.saltados}</b> saltados
                  {hecho.errores > 0 && <> · <b className="text-red-300">{hecho.errores}</b> con error</>}</p>
                <p className="text-sm text-slate-400">Cada conductor recibe un aviso en su móvil para aceptar el servicio.</p>
                <ul className="space-y-1 text-sm">
                  {hecho.lineas.filter((l) => l.resultado === "saltado" || l.resultado === "error").map((l) => (
                    <li key={l.servicioId} className="text-amber-300">
                      {res?.servicios[l.servicioId] ? `${hhmm(res.servicios[l.servicioId].hora)} ${res.servicios[l.servicioId].trayecto}` : l.servicioId} → {nombre(l.conductorId)}: {l.motivo}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setAbierto(false)} className={`${boton} bg-marca text-white`}>Hecho</button>
              </div>
            ) : !res ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-end gap-4 text-sm">
                  <label>Día<br /><input type="date" value={diaSel} onChange={(e) => { setDiaSel(e.target.value); cargar(e.target.value); }}
                    className="min-h-10 rounded-lg border border-slate-600 bg-slate-950 px-2" /></label>
                  <label>Margen mínimo entre servicios (min)<br />
                    <input type="number" min={0} max={120} value={margen} onChange={(e) => setMargen(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                      className="min-h-10 w-24 rounded-lg border border-slate-600 bg-slate-950 px-2" /></label>
                </div>
                {!datos ? <p className="text-sm text-slate-400">Cargando…</p> : (
                  <>
                    <section>
                      <h3 className="mb-2 font-medium">Servicios pendientes ({servs.size} de {datos.pendientes.length})</h3>
                      {!datos.pendientes.length && <p className="text-sm text-slate-400">No hay servicios pendientes ese día.</p>}
                      <ul className="grid gap-1 sm:grid-cols-2">
                        {datos.pendientes.map((p) => (
                          <li key={p.id}><label className="flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-sm hover:border-slate-600">
                            <input type="checkbox" checked={servs.has(p.id)} onChange={() => setServs((s) => alternar(s, p.id))} className="mt-1 size-4 accent-marca-claro" />
                            <span className="min-w-0"><b className="tabular-nums">{hhmm(p.hora)}</b> {p.trayecto} · {p.pasajeros} pax
                              <span className="block text-xs text-slate-400" title={p.duracionTexto}>{p.duracionTexto}</span></span>
                          </label></li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h3 className="mb-2 font-medium">Conductores disponibles ({conds.size})</h3>
                      <ul className="grid gap-1 sm:grid-cols-2">
                        {datos.conductores.map((c) => (
                          <li key={c.id}><label className="flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border border-slate-800 px-2 py-1.5 text-sm hover:border-slate-600">
                            <input type="checkbox" checked={conds.has(c.id)} onChange={() => setConds((s) => alternar(s, c.id))} className="mt-1 size-4 accent-marca-claro" />
                            <span className="min-w-0 flex-1">
                              <b>{c.nombre}</b> · {c.vehiculo ? `${c.vehiculo.matricula} · ${c.vehiculo.plazas} plazas` : "sin vehículo"}
                              {c.vehiculo?.estado === "taller" && <span className="ml-1 rounded bg-red-900/60 px-1.5 text-xs text-red-300">en taller</span>}
                              {c.compromisos > 0 && <span className="text-slate-400"> · {c.compromisos} ya asignados</span>}
                              {c.noDisponible && <span data-no-disponible className="ml-1 rounded bg-amber-900/60 px-1.5 text-xs text-amber-200">{c.noDisponible}</span>}
                              {c.turno && <span data-turno className="ml-1 rounded bg-slate-800 px-1.5 text-xs text-slate-300">{c.turno}</span>}
                              <span className={`mt-0.5 block w-fit rounded-full px-2 text-xs ${CONEXION[c.conexion.estado]}`}>{c.conexion.texto}</span>
                            </span>
                          </label></li>
                        ))}
                      </ul>
                    </section>
                    <fieldset>
                      <legend className="mb-2 font-medium">Estrategia</legend>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {ESTRATEGIAS.map((e) => (
                          <label key={e.clave} className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-sm ${estrategia === e.clave ? "border-marca-claro bg-marca/10" : "border-slate-800"}`}>
                            <input type="radio" name="estrategia" checked={estrategia === e.clave} onChange={() => setEstrategia(e.clave)} className="mt-1 accent-marca-claro" />
                            <span><b>{e.titulo}</b><span className="block text-xs text-slate-400">{e.explicacion}</span></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button type="button" disabled={pend || !servs.size || !conds.size} onClick={calcular} className={`${boton} bg-marca text-white`}>
                      {pend ? "Calculando…" : "Calcular propuesta"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-slate-400">
                  {ESTRATEGIAS.find((e) => e.clave === res.entrada.estrategia)?.titulo} · margen mínimo {res.entrada.margenMinimoMin} min.
                  Puedes cambiar el conductor de cada línea: se recalcula al momento.
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950 text-slate-400">
                      <tr>{["Hora", "Trayecto", "Conductor", "Llegada", "Margen", "Km vacío"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {asignadas.map((l) => {
                        const s = res.servicios[l.servicioId];
                        const color = l.ok ? colorMargen(l.margenMin, res.entrada.margenMinimoMin) : l.grave ? "rojo" : "naranja";
                        return (
                          <tr key={l.servicioId} data-linea={l.ok ? "ok" : "aviso"} className="border-t border-slate-800 align-top">
                            <td className="px-2 py-2 font-semibold tabular-nums">{hhmm(s?.hora)}</td>
                            <td className="px-2 py-2">{s?.trayecto}<span className="block text-xs text-slate-400">{s?.pasajeros} pax · {s?.duracionTexto}</span></td>
                            <td className="px-2 py-2">{selector(l.servicioId, l.conductorId)}
                              {!l.ok && (
                                <div className={`mt-1 text-xs ${l.grave ? "text-red-300" : "text-amber-300"}`}>
                                  ⚠ {l.motivoSiNo}
                                  <label className="mt-1 flex items-center gap-1 text-slate-300">
                                    <input type="checkbox" checked={forzar.has(l.servicioId)} onChange={() => setForzar((f) => alternar(f, l.servicioId))} className="accent-red-500" />
                                    Asignar igualmente
                                  </label>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 tabular-nums">{hhmm(l.llegadaEstimada)}</td>
                            <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[color]}`}>{l.margenMin == null ? "—" : `${l.margenMin} min`}</span></td>
                            <td className="px-2 py-2 tabular-nums">{l.kmVacio == null ? "—" : `${l.kmVacio} km`}</td>
                          </tr>
                        );
                      })}
                      {!asignadas.length && <tr><td colSpan={6} className="px-2 py-3 text-slate-400">Ninguna línea asignada.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {fuera.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-medium text-amber-300">Sin asignar ({fuera.length})</h3>
                    <ul className="space-y-2">
                      {fuera.map((l) => {
                        const s = res.servicios[l.servicioId];
                        return (
                          <li key={l.servicioId} className="grid gap-2 rounded-lg border border-slate-800 p-2 text-sm sm:grid-cols-[1fr_12rem]">
                            <span><b className="tabular-nums">{hhmm(s?.hora)}</b> {s?.trayecto} · {s?.pasajeros} pax
                              <span className={`block text-xs ${l.subcontratar ? "text-red-300" : "text-amber-300"}`}>{l.subcontratar ? "Subcontratar: " : ""}{l.motivoSiNo}</span></span>
                            {selector(l.servicioId, null)}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                <section>
                  <h3 className="mb-2 font-medium">Resumen por conductor</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950 text-slate-400"><tr>{["Conductor", "Servicios del día", "Nuevos", "Horas", "Km en vacío"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                      <tbody>
                        {evaluada!.metricas.map((m) => (
                          <tr key={m.conductorId} className="border-t border-slate-800">
                            <td className="px-2 py-2">{m.nombre}</td><td className="px-2 py-2">{m.servicios}</td><td className="px-2 py-2">{m.nuevos}</td>
                            <td className="px-2 py-2">{m.horas} h</td><td className="px-2 py-2">{m.kmVacio} km</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={pend} onClick={() => setRes(null)} className={`${boton} border border-slate-600`}>‹ Cambiar selección</button>
                  <button type="button" disabled={pend || !aEnviar.length} onClick={confirmar} className={`${boton} bg-marca text-white`}>
                    {pend ? "Enviando…" : `Confirmar y enviar (${aEnviar.length})`}
                  </button>
                  {asignadas.length > aEnviar.length && <span className="text-xs text-amber-300">{asignadas.length - aEnviar.length} con aviso no se envían (marca «Asignar igualmente»).</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
