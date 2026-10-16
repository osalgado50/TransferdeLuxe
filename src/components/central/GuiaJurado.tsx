"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const CLAVE = "tvl-guia-plegada";

/**
 * Guía rápida en el panel en vivo para quien evalúa o prueba la app: qué tocar y dónde, en cinco minutos. Se pliega y
 * el navegador lo recuerda (si no hay almacenamiento, vuelve a salir como al principio: no pasa nada).
 */
export default function GuiaJurado({ manana, soloDemo }: { manana: string; soloDemo: boolean }) {
  const [abierta, setAbierta] = useState(true);
  useEffect(() => {
    // Lo que eligió la última vez; si nunca la ha tocado, en el móvil empieza plegada (ocupa media pantalla).
    let pref: string | null = null;
    try { pref = localStorage.getItem(CLAVE); } catch { /* sin almacenamiento */ }
    setAbierta(pref ? pref === "0" : !window.matchMedia("(max-width: 639px)").matches);
  }, []);
  const alternar = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const open = e.currentTarget.open;
    if (open === abierta) return;
    setAbierta(open);
    try { localStorage.setItem(CLAVE, open ? "0" : "1"); } catch { /* sin almacenamiento */ }
  };
  const enlace = "font-medium text-marca-claro underline decoration-marca-claro/40 hover:decoration-marca-claro";
  const pasos: { t: string; d: React.ReactNode }[] = [
    { t: "Llena el panel", d: <>Si está vacío, pulsa <b>✨ Cargar datos de demo</b>: un día de trabajo con servicios en todos los estados. Se renueva sola cada pocas horas.</> },
    { t: "Mira el mapa", d: <>Los coches de demo se mueven solos. Pulsa uno para ver quién es; a la derecha salen los avisos (retrasos, rechazos, incidencias).</> },
    { t: "Asigna automáticamente", d: <>En la <Link href={`/central/ruta?dia=${manana}`} className={enlace}>hoja de ruta de mañana</Link> pulsa <b>⚡ Asignar automáticamente</b>: propone conductor para cada servicio según turnos, distancias y huecos.</> },
    { t: "Ponte en el lugar del conductor", d: <>En una ventana de incógnito entra con una cuenta de conductor (están en la pantalla de acceso). Acepta el servicio que le asignes y míralo cambiar aquí al instante.</> },
    { t: "Escanea un ticket", d: <>En el conductor, pestaña <b>Ticket</b>: haz una foto a un ticket de gasolinera (o pulsa «Probar con un ticket de ejemplo») y los campos se rellenan solos. Lo verás en <Link href="/central/combustible" className={enlace}>Combustible</Link>.</> },
    { t: "Reserva como cliente", d: <>Pide un traslado en la <Link href="/" className={enlace}>portada</Link> (español, catalán o inglés) y verás la reserva entrar en este panel.</> },
  ];
  return (
    <details open={abierta} onToggle={alternar} className="group rounded-xl border border-marca-claro/30 bg-slate-900/60" data-guia>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold text-marca-claro">
        <span aria-hidden>🧭</span> Guía rápida para probar la plataforma
        <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Mostrar</span>
        <span className="ml-auto hidden text-xs font-normal text-slate-400 group-open:inline">Ocultar</span>
      </summary>
      <ol className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
        {pasos.map((p, i) => (
          <li key={p.t} className="flex gap-3 rounded-lg bg-slate-950/50 p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marca-claro/15 text-sm font-bold text-marca-claro" aria-hidden>{i + 1}</span>
            <div className="text-sm text-slate-300"><p className="font-semibold text-white">{p.t}</p><p className="mt-0.5">{p.d}</p></div>
          </li>
        ))}
      </ol>
      <p className="px-4 pb-3 text-xs text-slate-400">
        <b>🗄 Archivar</b> deja el panel vacío{soloDemo ? " (estos días solo retira los datos de demo)" : ""} y <b>↩ Deshacer</b> lo devuelve tal cual.
        Todo son datos inventados: clientes, teléfonos y correos de prueba.
      </p>
    </details>
  );
}
