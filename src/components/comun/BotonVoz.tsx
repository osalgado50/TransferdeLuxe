"use client";
import { useEffect, useRef, useState } from "react";
import { falloDictado, limpiarDictado, type FalloDictado } from "@/lib/dominio/dictado";

/** Lo justo de la Web Speech API (Chrome/Android y Safari/iPhone la traen con prefijo «webkit»; Firefox, no). */
interface Reconocimiento {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type Constructor = new () => Reconocimiento;
const constructor = (): Constructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Constructor; webkitSpeechRecognition?: Constructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export interface TextosVoz { dictar: string; escuchando: string; permiso: string; noOido: string; otro: string }

/**
 * Botón de micrófono para dictar una dirección. Mientras se habla va escribiendo lo que entiende (`onParcial`) y al
 * terminar entrega el texto limpio (`onTexto`). Si el navegador no sabe dictar, no aparece.
 */
export default function BotonVoz({ idioma, textos, onParcial, onTexto, className, sobreClaro }: {
  idioma: string; textos: TextosVoz; onParcial: (t: string) => void; onTexto: (t: string) => void; className?: string;
  /** El campo es blanco (portada): icono oscuro; si no, claro sobre el campo oscuro. */
  sobreClaro?: boolean;
}) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [fallo, setFallo] = useState<Exclude<FalloDictado, null> | null>(null);
  const rec = useRef<Reconocimiento | null>(null);
  const cb = useRef({ onParcial, onTexto });
  useEffect(() => { cb.current = { onParcial, onTexto }; });
  useEffect(() => { setSoportado(!!constructor()); return () => rec.current?.abort(); }, []);
  useEffect(() => {
    if (!fallo) return;
    const t = setTimeout(() => setFallo(null), 5000);
    return () => clearTimeout(t);
  }, [fallo]);

  if (!soportado) return null;

  const alternar = () => {
    if (escuchando) { rec.current?.stop(); return; }
    const C = constructor();
    if (!C) return;
    const r = new C();
    r.lang = idioma; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) final += x[0].transcript; else parcial += x[0].transcript;
      }
      const t = limpiarDictado(final + parcial);
      if (t) cb.current.onParcial(t);
    };
    r.onerror = (e) => { const f = falloDictado(e.error); if (f) setFallo(f); };
    r.onend = () => {
      setEscuchando(false);
      rec.current = null;
      const t = limpiarDictado(final);
      if (t) cb.current.onTexto(t);
    };
    setFallo(null);
    try { r.start(); rec.current = r; setEscuchando(true); } catch { setFallo("otro"); }
  };

  const etiqueta = escuchando ? textos.escuchando : textos.dictar;
  return (
    <>
      <button type="button" onClick={alternar} aria-pressed={escuchando} aria-label={etiqueta} title={etiqueta}
        className={`flex items-center justify-center rounded-lg transition ${escuchando ? "animate-pulse bg-red-600 text-white" : sobreClaro ? "bg-slate-900/10 text-slate-700 hover:bg-amber-200" : "bg-slate-400/20 text-slate-200 hover:bg-slate-400/35"} ${className ?? ""}`}>
        <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill={escuchando ? "currentColor" : "none"} />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      <span role="status" className="sr-only">{escuchando ? textos.escuchando : ""}</span>
      {fallo && (
        <span role="alert" className="absolute right-0 top-full z-20 mt-1 max-w-[16rem] rounded-lg bg-slate-800 px-3 py-2 text-sm font-normal text-amber-200 shadow-lg">
          {textos[fallo]}
        </span>
      )}
    </>
  );
}
