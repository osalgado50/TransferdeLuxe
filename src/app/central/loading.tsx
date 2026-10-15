/** Indicador al cambiar de vista en la central (el menú lateral se queda; solo el contenido muestra «Cargando…»). */
export default function CargandoCentral() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <svg className="h-4 w-4 animate-spin text-marca-claro" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Cargando…
      </div>
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="h-8 w-56 rounded-lg bg-slate-800" />
        <div className="h-24 rounded-xl bg-slate-900" />
        <div className="h-64 rounded-xl bg-slate-900" />
      </div>
    </div>
  );
}
