"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { filtrarDirecciones, type Favorito } from "@/lib/dominio/favoritos";
import { filtrarLugaresEmpresa, sugerenciaEmpresa, type LugarEmpresa } from "@/lib/dominio/lugaresEmpresa";
import { atribucion, combinarSugerencias, normalizarBusqueda, type LugarSugerido } from "@/lib/dominio/geocodificacion";
import { crearCacheTemporal } from "@/lib/cacheTemporal";

type Lugar = LugarSugerido;
/** Búsquedas ya respondidas (compartidas por todos los campos de la página): volver a escribirlas es instantáneo. */
const recientes = crearCacheTemporal<Lugar[]>({ max: 100, ttlMs: 10 * 60_000 });
/** Pausa tras la última tecla antes de preguntar al servidor. */
const PAUSA_MS = 250;
const ICONO: Partial<Record<NonNullable<Lugar["fuente"]>, string>> = { empresa: "🏢 ", favorito: "⭐ ", frecuente: "📍 " };
type Props = {
  name: string; etiqueta: string; requerido?: boolean; valorInicial?: string; error?: string;
  /** Favoritos de dirección (solo modo central): salen primero en las sugerencias. */
  favoritos?: Favorito[];
  /** Lugares de la empresa (solo modo central, nunca en /reservar): salen los primeros, marcados 🏢. */
  lugaresEmpresa?: LugarEmpresa[];
  /** Rellena el campo desde fuera (p. ej. al elegir un trayecto favorito); `n` cambia en cada relleno. */
  rellenar?: { n: number; texto: string; lat: number | null; lng: number | null };
  /** Avisa del valor actual (texto y coordenadas como texto). */
  onCambio?: (v: { texto: string; lat: string; lng: string }) => void;
  /** Contenido extra junto a la etiqueta (p. ej. botón de favorito). */
  extra?: ReactNode;
};

export default function CampoDireccion({ name, etiqueta, requerido, valorInicial = "", error, favoritos, lugaresEmpresa, rellenar, onCambio, extra }: Props) {
  const [texto, setTexto] = useState(valorInicial);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [foco, setFoco] = useState(false);
  /** Texto cuya búsqueda ya respondió (para saber que «no hay sugerencias» no es «aún buscando»). */
  const [buscado, setBuscado] = useState<string | null>(null);
  /** Hay una búsqueda en marcha (se enseña el indicador «Buscando…»). */
  const [buscando, setBuscando] = useState(false);
  const elegido = useRef<string | null>(null);

  useEffect(() => {
    if (!rellenar) return;
    elegido.current = rellenar.texto;
    setTexto(rellenar.texto); setLat(rellenar.lat == null ? "" : String(rellenar.lat)); setLng(rellenar.lng == null ? "" : String(rellenar.lng));
    setLugares([]); setAbierto(false);
  }, [rellenar]);

  useEffect(() => { onCambio?.({ texto, lat, lng }); }, [texto, lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const libre = elegido.current !== texto;
  const empresa: Lugar[] = libre && lugaresEmpresa ? filtrarLugaresEmpresa(lugaresEmpresa, texto).map(sugerenciaEmpresa) : [];
  const favs: Lugar[] = libre && favoritos
    ? filtrarDirecciones(favoritos, texto).map((f) => ({ etiqueta: f.origen_texto, lat: f.origen_lat, lng: f.origen_lng, frecuente: true, fuente: "favorito" as const, nombre: f.nombre }))
    : [];
  const locales = [...empresa, ...favs];
  const todos = combinarSugerencias({ empresa, favoritos: favs, externos: lugares });
  const pie = atribucion(todos);
  // Sin sugerencias tras ≥ 6 letras: se ofrece usar el texto tal cual para no bloquear la reserva.
  const talCual = libre && foco && !buscando && todos.length === 0 && texto.trim().length >= 6 && buscado === texto.trim();

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 3 || elegido.current === texto) { setLugares([]); setBuscando(false); return; }
    const clave = normalizarBusqueda(q);
    const enCache = recientes.get(clave);
    if (enCache) { setLugares(enCache); setBuscado(q); setAbierto(true); setBuscando(false); return; }
    // Las sugerencias locales (🏢 ⭐) ya se ven; el indicador avisa de que falta la búsqueda en el mapa.
    setBuscando(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocodificar?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const datos: Lugar[] = r.ok ? await r.json() : [];
        if (ctl.signal.aborted) return;
        if (r.ok) recientes.set(clave, datos);
        setLugares(datos);
        setBuscado(q);
        setAbierto(true);
      } catch { /* abortado o sin red */ } finally {
        if (!ctl.signal.aborted) setBuscando(false);
      }
    }, PAUSA_MS);
    return () => { clearTimeout(t); ctl.abort(); setBuscando(false); };
  }, [texto]);

  function usarTalCual() {
    elegido.current = texto;
    setLat(""); setLng(""); setLugares([]); setAbierto(false);
  }

  function elegir(l: Lugar) {
    elegido.current = l.etiqueta;
    setTexto(l.etiqueta); setLat(l.lat == null ? "" : String(l.lat)); setLng(l.lng == null ? "" : String(l.lng));
    setLugares([]); setAbierto(false);
    // Sugerencia de Google: las coordenadas se piden al elegirla (Place Details).
    if (l.placeId && l.lat == null) {
      fetch(`/api/geocodificar?lugar=${encodeURIComponent(l.placeId)}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!d || elegido.current !== l.etiqueta) return;
        setLat(String(d.lat)); setLng(String(d.lng));
      }).catch(() => { /* sin coordenadas: se guarda solo el texto */ });
    }
  }

  return (
    <div className="relative">
      {extra && <div className="absolute right-0 top-0">{extra}</div>}
      <label className="block text-sm font-medium text-slate-200">
        {etiqueta}
        <span className="relative mt-1 block">
          <input
            type="text" name={`${name}_texto`} value={texto} required={requerido} autoComplete="off" aria-busy={buscando}
            onChange={(e) => { setTexto(e.target.value); setLat(""); setLng(""); elegido.current = null; }}
            onFocus={() => { setFoco(true); if (todos.length) setAbierto(true); }}
            onBlur={() => setTimeout(() => setFoco(false), 150)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 py-2 pl-3 pr-9 text-slate-100 focus:border-marca-claro focus:outline-none"
          />
          {buscando && <Girando className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-marca-claro" />}
        </span>
      </label>
      <span role="status" className="sr-only">{buscando ? "Buscando direcciones…" : ""}</span>
      <input type="hidden" name={`${name}_lat`} value={lat} />
      <input type="hidden" name={`${name}_lng`} value={lng} />
      {(((abierto || (foco && locales.length > 0)) && todos.length > 0) || (foco && buscando)) && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-600 bg-slate-900 shadow-lg">
          {todos.length > 0 && <ul className="max-h-60 overflow-auto">
            {todos.map((l, i) => (
              <li key={`${l.etiqueta}-${i}`}>
                <button type="button" onClick={() => elegir(l)} className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                  {ICONO[l.fuente ?? (l.frecuente ? "frecuente" : "photon")] ?? ""}
                  {l.fuente === "favorito" && l.nombre ? `${l.nombre} — ${l.etiqueta}` : l.etiqueta}
                </button>
              </li>
            ))}
          </ul>}
          {buscando && (
            <p className="flex items-center gap-2 border-t border-slate-800 px-3 py-2 text-sm text-slate-400 first:border-t-0" aria-hidden="true">
              <Girando className="h-3.5 w-3.5 text-marca-claro" /> Buscando en el mapa…
            </p>
          )}
          {pie && <p className="border-t border-slate-800 px-3 py-1 text-right text-[11px] text-slate-500">{pie}</p>}
        </div>
      )}
      {talCual && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-600 bg-slate-900 shadow-lg">
          <button type="button" onClick={usarTalCual} className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
            Usar “{texto.trim()}” tal cual <span className="text-slate-500">(sin punto en el mapa)</span>
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** Icono giratorio de «buscando» (decorativo: el aviso accesible va en el role="status"). */
function Girando({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
