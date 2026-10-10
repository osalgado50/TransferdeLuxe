"use client";
import { useState } from "react";

function copiarTexto(texto: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto).catch(() => copiarFallback(texto));
  return copiarFallback(texto);
}
function copiarFallback(texto: string): Promise<void> {
  const ta = document.createElement("textarea");
  ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
  return Promise.resolve();
}
function rellenar(id: string, valor: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set ? set.call(el, valor) : (el.value = valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const btn = "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 px-3 text-sm text-slate-200 hover:border-marca-claro hover:text-marca-claro";

function BotonCopiar({ valor, copiado, onCopiar }: { valor: string; copiado: boolean; onCopiar: (v: string) => void }) {
  return (
    <button type="button" onClick={() => onCopiar(valor)} aria-label={`Copiar ${valor}`} className={btn}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
      <span aria-hidden="true">{copiado ? "Copiado ✓" : "Copiar"}</span>
    </button>
  );
}

export function CuentasDemo({ cuentas, clave }: { cuentas: string[]; clave?: string }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  async function copiar(v: string) {
    await copiarTexto(v);
    setCopiado(v);
    setTimeout(() => setCopiado((c) => (c === v ? null : c)), 1800);
  }
  const usar = (email: string) => { rellenar("email", email); if (clave) rellenar("password", clave); document.getElementById(clave ? "password" : "email")?.focus(); };
  const fila = "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/70 px-3 py-2";
  const mono = "min-w-0 break-all font-mono text-base text-slate-100";
  return (
    <aside className="rounded-2xl border border-slate-700 p-4 text-base text-slate-300">
      <h2 className="mb-3 text-lg font-semibold text-slate-100">Cuentas de demo</h2>
      <ul className="space-y-2">
        {cuentas.map((c) => (
          <li key={c} className={fila}>
            <span className={mono}>{c}</span>
            <span className="flex gap-2">
              <BotonCopiar valor={c} copiado={copiado === c} onCopiar={copiar} />
              <button type="button" onClick={() => usar(c)} aria-label={`Usar ${c}`} className={btn}>Usar</button>
            </span>
          </li>
        ))}
      </ul>
      {clave && (
        <div className={`${fila} mt-3`}>
          <span className="min-w-0">Contraseña: <span className="break-all font-mono text-base text-marca-claro">{clave}</span></span>
          <BotonCopiar valor={clave} copiado={copiado === clave} onCopiar={copiar} />
        </div>
      )}
    </aside>
  );
}
