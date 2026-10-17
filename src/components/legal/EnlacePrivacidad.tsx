"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Idioma } from "@/lib/i18n/portada";

const VOLVER: Record<Idioma, string> = { es: "Volver al formulario", ca: "Tornar al formulari", en: "Back to the form" };
const CARGANDO: Record<Idioma, string> = { es: "Cargando…", ca: "Carregant…", en: "Loading…" };

/**
 * Enlace a la política de privacidad desde un formulario: la abre en una ventana encima, con «Volver al formulario», en
 * vez de navegar a otra página (al volver atrás, el navegador vaciaba el formulario). Sin JavaScript sigue siendo un enlace.
 */
export default function EnlacePrivacidad({ idioma = "es", className, children }: { idioma?: Idioma; className?: string; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const [contenido, setContenido] = useState<{ titulo: string; cuerpo: ReactNode } | null>(null);

  const abrir = (e: React.MouseEvent) => {
    e.preventDefault();
    dialogo.current?.showModal();
    if (!contenido) {
      // El texto legal solo se descarga si alguien lo abre.
      void import("./contenidoPrivacidad").then((m) => setContenido({ titulo: m.TITULO_PRIVACIDAD[idioma], cuerpo: m.contenidoPrivacidad(idioma) }));
    }
  };
  const cerrar = () => dialogo.current?.close();
  const boton = "min-h-12 w-full rounded-xl bg-amber-300 px-4 text-lg font-bold text-slate-950 hover:bg-amber-200";

  return (
    <>
      <a href={`/privacidad?lang=${idioma}`} onClick={abrir} className={className}>{children}</a>
      {/* En un portal: dentro del <label> de la casilla, cualquier toque en el texto la marcaría o desmarcaría. */}
      {montado && createPortal(<dialog ref={dialogo} lang={idioma} aria-label={contenido?.titulo}
        onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 p-0 text-left text-slate-300 backdrop:bg-black/70">
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
            <h2 className="flex-1 text-xl font-semibold text-white">{contenido?.titulo ?? CARGANDO[idioma]}</h2>
            <button type="button" onClick={cerrar} aria-label={VOLVER[idioma]}
              className="flex size-11 items-center justify-center rounded-full text-2xl text-slate-300 hover:bg-white/10">✕</button>
          </header>
          <div className="space-y-6 overflow-y-auto px-4 py-4 text-base">{contenido?.cuerpo}</div>
          <footer className="border-t border-slate-800 p-4">
            <button type="button" onClick={cerrar} className={boton}>← {VOLVER[idioma]}</button>
          </footer>
        </div>
      </dialog>, document.body)}
    </>
  );
}
