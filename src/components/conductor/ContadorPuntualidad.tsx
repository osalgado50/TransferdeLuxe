"use client";
import { useEffect, useRef, useState } from "react";
import { incidenciaConductor } from "@/app/conductor/modulos-actions";
import {
  calcularPuntualidad, claveAvisoRetraso, COLOR_PUNTUALIDAD, debeAvisarRetraso, REFRESCO_PUNTUALIDAD_MS, textoAvisoRetraso,
} from "@/lib/dominio/puntualidad";

/** Evento con la ETA de NavegacionConductor (segundos restantes hasta la recogida, o null). */
export const EVENTO_ETA = "tdl-eta-recogida";
export interface DetalleEta { servicioId: string; etaS: number | null }

function leido(clave: string): boolean { try { return !!localStorage.getItem(clave); } catch { return false; } }
function guardar(clave: string) { try { localStorage.setItem(clave, "1"); } catch { /* sin almacenamiento: vale para esta pestaña */ } }
function posicion(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!("geolocation" in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 5000, maximumAge: 60_000 });
  });
}

/**
 * Contador grande de puntualidad (verde / ámbar / rojo) de la PWA del conductor, con la ETA de la navegación.
 * Si la ETA dice que llegará tarde (antes de la hora), avisa UNA vez a la central con una incidencia «retraso»
 * automática (persistido en localStorage); si falla, como mucho un intento cada 60 s.
 */
export default function ContadorPuntualidad({ servicioId, estado, recogida }: { servicioId: string; estado: string; recogida: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  const [etaS, setEtaS] = useState<number | null>(null);
  const [avisada, setAvisada] = useState(false);
  const enviado = useRef<boolean | null>(null);
  const enCurso = useRef(false);
  const ultimo = useRef(0);
  const clave = claveAvisoRetraso(servicioId);

  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), REFRESCO_PUNTUALIDAD_MS); return () => clearInterval(t); }, []);
  useEffect(() => { const v = leido(clave); enviado.current = v; setAvisada(v); }, [clave]);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<DetalleEta>).detail;
      if (d?.servicioId === servicioId) setEtaS(d.etaS);
    };
    window.addEventListener(EVENTO_ETA, f);
    return () => window.removeEventListener(EVENTO_ETA, f);
  }, [servicioId]);

  const p = calcularPuntualidad({ estado, recogida, ahora, etaS });
  const tarde = p.estado === "tarde" && p.porEta;
  useEffect(() => {
    if (enviado.current === null) return;
    const t = Date.now();
    if (!debeAvisarRetraso(p, { enviado: enviado.current, enCurso: enCurso.current, ultimoIntento: ultimo.current, ahora: t })) return;
    enCurso.current = true;
    ultimo.current = t;
    const descripcion = textoAvisoRetraso(p);
    void (async () => {
      try {
        const fd = new FormData();
        fd.set("tipo", "retraso"); fd.set("descripcion", descripcion); fd.set("servicio_id", servicioId);
        const pos = await posicion();
        if (pos) { fd.set("lat", String(pos.coords.latitude)); fd.set("lng", String(pos.coords.longitude)); }
        const r = await incidenciaConductor(fd);
        if (r.ok) { enviado.current = true; guardar(clave); setAvisada(true); }
      } catch { /* sin red: siguiente intento pasados 60 s */ } finally { enCurso.current = false; }
    })();
  }, [ahora, tarde, clave, servicioId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p.estado) return null;
  const c = COLOR_PUNTUALIDAD[p.estado];
  return (
    <div role={p.estado === "tarde" ? "alert" : "status"} aria-live="polite" className="rounded-2xl px-4 py-4 text-center shadow-lg"
      style={{ backgroundColor: c.fondo, color: c.texto }}>
      <p className="text-2xl font-black tabular-nums">{p.texto}</p>
      {avisada && p.estado === "tarde" && <p className="mt-1 text-sm font-bold opacity-90">Central avisada del retraso</p>}
    </div>
  );
}
