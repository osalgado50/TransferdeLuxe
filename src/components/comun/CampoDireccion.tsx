"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { filtrarDirecciones, type Favorito } from "@/lib/dominio/favoritos";

type Lugar = { etiqueta: string; lat: number | null; lng: number | null; frecuente: boolean; nombreFavorito?: string };
type Props = {
  name: string; etiqueta: string; requerido?: boolean; valorInicial?: string; error?: string;
  /** Favoritos de dirección (solo modo central): salen primero en las sugerencias. */
  favoritos?: Favorito[];
  /** Rellena el campo desde fuera (p. ej. al elegir un trayecto favorito); `n` cambia en cada relleno. */
  rellenar?: { n: number; texto: string; lat: number | null; lng: number | null };
  /** Avisa del valor actual (texto y coordenadas como texto). */
  onCambio?: (v: { texto: string; lat: string; lng: string }) => void;
  /** Contenido extra junto a la etiqueta (p. ej. botón de favorito). */
  extra?: ReactNode;
};

export default function CampoDireccion({ name, etiqueta, requerido, valorInicial = "", error, favoritos, rellenar, onCambio, extra }: Props) {
  const [texto, setTexto] = useState(valorInicial);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [foco, setFoco] = useState(false);
  const elegido = useRef<string | null>(null);

  useEffect(() => {
    if (!rellenar) return;
    elegido.current = rellenar.texto;
    setTexto(rellenar.texto); setLat(rellenar.lat == null ? "" : String(rellenar.lat)); setLng(rellenar.lng == null ? "" : String(rellenar.lng));
    setLugares([]); setAbierto(false);
  }, [rellenar]);

  useEffect(() => { onCambio?.({ texto, lat, lng }); }, [texto, lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const favs: Lugar[] = elegido.current === texto || !favoritos ? []
    : filtrarDirecciones(favoritos, texto).map((f) => ({ etiqueta: f.origen_texto, lat: f.origen_lat, lng: f.origen_lng, frecuente: true, nombreFavorito: f.nombre }));
  const todos = [...favs, ...lugares.filter((l) => !favs.some((f) => f.etiqueta === l.etiqueta))];

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
    setTexto(l.etiqueta); setLat(l.lat == null ? "" : String(l.lat)); setLng(l.lng == null ? "" : String(l.lng));
    setLugares([]); setAbierto(false);
  }

  return (
    <div className="relative">
      {extra && <div className="absolute right-0 top-0">{extra}</div>}
      <label className="block text-sm font-medium text-slate-200">
        {etiqueta}
        <input
          type="text" name={`${name}_texto`} value={texto} required={requerido} autoComplete="off"
          onChange={(e) => { setTexto(e.target.value); setLat(""); setLng(""); elegido.current = null; }}
          onFocus={() => { setFoco(true); if (todos.length) setAbierto(true); }}
          onBlur={() => setTimeout(() => setFoco(false), 150)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-marca-claro focus:outline-none"
        />
      </label>
      <input type="hidden" name={`${name}_lat`} value={lat} />
      <input type="hidden" name={`${name}_lng`} value={lng} />
      {(abierto || (foco && favs.length > 0)) && todos.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-lg">
          {todos.map((l, i) => (
            <li key={`${l.etiqueta}-${i}`}>
              <button type="button" onClick={() => elegir(l)} className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                {l.frecuente ? "⭐ " : ""}{l.nombreFavorito ? `${l.nombreFavorito} — ${l.etiqueta}` : l.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
