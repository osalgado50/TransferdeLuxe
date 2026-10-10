"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoTVL from "@/components/comun/LogoTVL";

export const ENLACES_CENTRAL = [
  ["/central", "Panel", "Panel", "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10"],
  ["/central/servicios", "Servicios", "Servicios", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  ["/central/ruta", "Hoja de ruta", "Ruta", "M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3zM9 7v13M15 4v13"],
  ["/central/combustible", "Combustible", "Combust.", "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M6 8h6"],
  ["/central/flota", "Flota", "Flota", "M3 13l2-6h14l2 6v5h-3v-2H6v2H3zM3 13h18M7 16h.01M17 16h.01"],
] as const;

function activo(ruta: string, h: string) {
  if (h === "/central") return ruta === "/central";
  return ruta === h || ruta.startsWith(h + "/");
}

export default function NavCentralMovil({ nombre, salir }: { nombre: string; salir: () => Promise<void> }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [abierto]);

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-[1900] flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-900 px-3">
        <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto} aria-controls="menu-central"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-200 hover:bg-slate-800">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <Link href="/central" className="flex min-h-11 items-center gap-2"><LogoTVL alto={36} /><span className="text-sm font-semibold text-marca-claro">Centro de control</span></Link>
      </header>

      {abierto && <div className="fixed inset-0 z-[2000] bg-black/60" onClick={() => setAbierto(false)} aria-hidden="true" />}
      <aside id="menu-central" role="dialog" aria-modal="true" aria-label="Menú del centro de control" aria-hidden={!abierto}
        className={`fixed inset-y-0 left-0 z-[2001] flex w-72 max-w-[85vw] flex-col gap-1 bg-slate-900 p-4 shadow-xl transition-transform duration-200 ${abierto ? "translate-x-0" : "-translate-x-full invisible"}`}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-marca-claro">TransferdeLuxe</span>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-800">✕</button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {ENLACES_CENTRAL.map(([h, t]) => (
            <Link key={h} href={h} onClick={() => setAbierto(false)} aria-current={activo(ruta, h) ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-lg px-3 text-base ${activo(ruta, h) ? "bg-marca text-white" : "hover:bg-slate-800 hover:text-marca-claro"}`}>{t}</Link>
          ))}
        </nav>
        <p className="mb-2 text-sm text-slate-400">{nombre}</p>
        <form action={salir}><button className="min-h-11 w-full rounded-lg border border-slate-600 px-3 text-sm hover:border-marca-claro">Salir</button></form>
      </aside>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-[1900] grid grid-cols-5 border-t border-slate-800 bg-slate-900 pb-[env(safe-area-inset-bottom)]">
        {ENLACES_CENTRAL.map(([h, , corto, d]) => (
          <Link key={h} href={h} aria-current={activo(ruta, h) ? "page" : undefined} aria-label={corto}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${activo(ruta, h) ? "text-marca-claro" : "text-slate-400"}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            <span>{corto}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
