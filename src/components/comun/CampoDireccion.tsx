"use client";
import { useEffect, useRef, useState } from "react";

type Lugar = { etiqueta: string; lat: number; lng: number; frecuente: boolean };
type Props = { name: string; etiqueta: string; requerido?: boolean; valorInicial?: string; error?: string };

export default function CampoDireccion({ name, etiqueta, requerido, valorInicial = "", error }: Props) {
  const [texto, setTexto] = useState(valorInicial);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [abierto, setAbierto] = useState(false);
  const elegido = useRef<string | null>(null);

  useEffect(() => {
    if (texto.trim().length < 3 || elegido.current === texto) { setLugares([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocodificar?q=${encodeURIComponent(texto.trim())}`, { signal: ctl.signal });
        if (!r.ok) return;
        setLugares(await r.json());
        setAbierto(true);
      } catch { /* abortado o sin red */ }
    }, 500);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [texto]);

  function elegir(l: Lugar) {
    elegido.current = l.etiqueta;
    setTexto(l.etiqueta); setLat(String(l.lat)); setLng(String(l.lng));
    setLugares([]); setAbierto(false);
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-200">
        {etiqueta}
        <input
          type="text" name={`${name}_texto`} value={texto} required={requerido} autoComplete="off"
          onChange={(e) => { setTexto(e.target.value); setLat(""); setLng(""); elegido.current = null; }}
          onFocus={() => lugares.length && setAbierto(true)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-marca-claro focus:outline-none"
        />
      </label>
      <input type="hidden" name={`${name}_lat`} value={lat} />
      <input type="hidden" name={`${name}_lng`} value={lng} />
      {abierto && lugares.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-lg">
          {lugares.map((l, i) => (
            <li key={`${l.etiqueta}-${i}`}>
              <button type="button" onClick={() => elegir(l)} className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                {l.frecuente ? "⭐ " : ""}{l.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
