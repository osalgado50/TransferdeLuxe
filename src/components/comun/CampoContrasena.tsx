"use client";
import { useState } from "react";

// Campo de contraseña con botón para mostrarla y comprobar que se ha escrito bien.
export function CampoContrasena({ id, name, className, autoComplete, required, minLength }: {
  id: string; name: string; className?: string; autoComplete?: string; required?: boolean; minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={visible ? "text" : "password"} required={required} minLength={minLength}
        autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        className={`${className ?? ""} pr-12`} />
      <button type="button" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible}
        className="absolute inset-y-0 right-0 mt-1 flex w-11 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-100">
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}
