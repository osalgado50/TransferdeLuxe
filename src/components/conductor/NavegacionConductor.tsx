"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapaNavegacion from "@/components/mapa/MapaNavegacionCarga";
import { distanciaKm } from "@/lib/dominio/geo";
import { EVENTO_RESALTAR, faseProximidad, formatoDistancia, formatoDuracion, restanteEnRuta, type Fase, type Objetivo } from "@/lib/dominio/navegacion";
import { suscribirGps } from "@/lib/gps/gestor";
import { avisarLlegando } from "@/app/conductor/actions";
import type { Punto } from "@/lib/dominio/tipos";
import { pitar, prepararDesbloqueo } from "@/lib/sonidos";

interface Ruta { coords: [number, number][]; distanciaM: number; duracionS: number; fuente: "osrm" | "recta" }
type Pos = Punto & { precision: number };

const DESVIO_M = 300, REPETIR_MS = 30_000;

function vibrar(patron: number[]) { try { navigator.vibrate?.(patron); } catch { /* sin vibración */ } }
function marcado(clave: string): boolean { try { return !!sessionStorage.getItem(clave); } catch { return false; } }
function marcar(clave: string) { try { sessionStorage.setItem(clave, "1"); } catch { /* sin almacenamiento */ } }
function yaAvisado(clave: string): boolean {
  try { if (sessionStorage.getItem(clave)) return true; sessionStorage.setItem(clave, "1"); } catch { /* sin almacenamiento */ }
  return false;
}

export default function NavegacionConductor({ servicioId, objetivo, origenServicio }: { servicioId: string; objetivo: Objetivo; origenServicio: Punto | null }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [seguir, setSeguir] = useState(true);
  const simulado = useRef(false);
  const enviando = useRef(false);
  const ultimoIntento = useRef(0);
  const [fase, setFase] = useState<Fase>("lejos");
  const pedida = useRef<{ clave: string; t: number; conPos: boolean } | null>(null);
  const claveObj = `${objetivo.tipo}:${objetivo.punto.lat},${objetivo.punto.lng}`;
  const aObj = objetivo.tipo === "recogida" ? "a la recogida" : "al destino";

  // GPS propio de la pantalla de navegación (independiente del interruptor «En servicio»).
  useEffect(() => {
    // Solo en desarrollo: ?simular=lat,lng fija una posición de prueba (y no avisa a la central).
    const sim = process.env.NODE_ENV !== "production" ? new URLSearchParams(location.search).get("simular") : null;
    if (sim) {
      const [lat, lng] = sim.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) { simulado.current = true; setPos({ lat, lng, precision: 25 }); return; }
    }
    // GPS compartido con el interruptor «En servicio» (un solo watch por página, con watchdog).
    return suscribirGps({
      fix: (p) => { setAvisoGps(null); setPos({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }); },
      error: (e) => setAvisoGps(e.code === e.PERMISSION_DENIED ? "Permite la ubicación en el navegador para ver tu posición y la distancia restante" : "Buscando señal GPS…"),
    });
  }, []);

  // Desbloquear el audio con el primer gesto del usuario.
  useEffect(() => prepararDesbloqueo(), []);

  const restante = useMemo(() => (ruta && pos ? restanteEnRuta(ruta.coords, pos) : null), [ruta, pos]);

  // Pedir ruta: al cambiar el objetivo, al llegar el primer fix, o si se desvía > 300 m (máx. 1 vez / 30 s).
  const pedir = useCallback(async (o: Punto) => {
    try {
      const r = await fetch(`/api/ruta?o=${o.lat.toFixed(5)},${o.lng.toFixed(5)}&d=${objetivo.punto.lat},${objetivo.punto.lng}`);
      if (!r.ok) throw new Error(String(r.status));
      setRuta((await r.json()) as Ruta);
    } catch { pedida.current = null; /* sin red: se reintenta en el próximo fix */ }
  }, [objetivo.punto.lat, objetivo.punto.lng]);
  useEffect(() => {
    const p = pedida.current, ahora = Date.now();
    const origen = pos ?? (objetivo.tipo === "destino" ? origenServicio : null);
    if (!origen) return;
    const nuevo = !p || p.clave !== claveObj;
    const primerFix = !!p && !p.conPos && !!pos;
    const desviado = !!p && !!restante && restante.desvioM > DESVIO_M && ahora - p.t > REPETIR_MS;
    if (!nuevo && !primerFix && !desviado) return;
    pedida.current = { clave: claveObj, t: ahora, conPos: !!pos };
    if (nuevo) setRuta(null);
    void pedir(origen);
  }, [pos, restante, claveObj, objetivo.tipo, origenServicio, pedir]);

  // Fase de proximidad (distancia en línea recta al objetivo, con histéresis).
  const distObj = pos ? distanciaKm(pos, objetivo.punto) * 1000 : null;
  useEffect(() => { setFase("lejos"); }, [claveObj]);
  useEffect(() => {
    if (distObj == null) return;
    setFase((f) => faseProximidad(distObj, f));
  }, [distObj]);
  useEffect(() => {
    if (fase === "lejos") return;
    const base = `tdl-nav:${servicioId}:${objetivo.tipo}`;
    if (!simulado.current && !marcado(`${base}:central`) && !enviando.current && Date.now() - ultimoIntento.current > 15_000) {
      enviando.current = true; ultimoIntento.current = Date.now(); // si falla, se reintenta en un fix posterior
      void avisarLlegando(servicioId, objetivo.tipo)
        .then((r) => { if (r.ok) marcar(`${base}:central`); }, () => undefined)
        .finally(() => { enviando.current = false; });
    }
    if (fase === "cerca" && !yaAvisado(`${base}:cerca`)) { vibrar([200, 100, 200]); pitar(2, 880); }
    if (fase === "llegado" && !yaAvisado(`${base}:llegado`)) { vibrar([400, 150, 400, 150, 400]); pitar(4, 1046); }
    window.dispatchEvent(new CustomEvent(EVENTO_RESALTAR, { detail: { activo: fase === "llegado" } }));
  }, [fase, servicioId, objetivo.tipo, pos]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent(EVENTO_RESALTAR, { detail: { activo: false } })); }, []);

  const quedaM = restante?.restanteM ?? distObj ?? ruta?.distanciaM ?? null;
  const quedaS = ruta && quedaM != null ? (ruta.distanciaM > 0 ? ruta.duracionS * Math.min(1, quedaM / ruta.distanciaM) : 0) : null;
  const titulo = objetivo.tipo === "recogida" ? "Hacia la recogida" : "Hacia el destino";

  return (
    <div className="space-y-2">
      {fase !== "lejos" && (
        <div role="alert" className={`sticky top-0 z-[1200] rounded-xl px-4 py-3 text-center text-lg font-bold shadow-lg ${fase === "llegado" ? "bg-green-500 text-slate-950" : "bg-amber-400 text-slate-950"}`}>
          {fase === "llegado" ? `Has llegado ${aObj}` : `Estás llegando ${aObj}${distObj != null ? ` (≈ ${formatoDistancia(distObj)})` : ""}`}
        </div>
      )}
      <div className="relative isolate overflow-hidden rounded-xl border border-slate-700">
        <div className="absolute inset-x-0 top-0 z-[1100] bg-slate-950/90 px-3 py-2 text-base font-semibold text-white">
          {titulo}{quedaM != null && ` · ${formatoDistancia(quedaM)}`}{quedaS != null && ` · ${formatoDuracion(quedaS)}`}
          {ruta?.fuente === "recta" && <span className="block text-xs font-normal text-amber-300">Ruta aproximada (sin servicio de rutas)</span>}
        </div>
        <MapaNavegacion pos={pos} objetivo={objetivo} coords={ruta?.coords ?? null} seguir={seguir} onPan={() => setSeguir(false)} />
        {pos && !seguir && (
          <button type="button" onClick={() => setSeguir(true)} className="absolute bottom-3 right-3 z-[1100] min-h-12 rounded-full bg-blue-600 px-5 text-base font-bold text-white shadow-lg">
            Centrar
          </button>
        )}
      </div>
      {avisoGps && <p role="status" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">{avisoGps}</p>}
    </div>
  );
}
