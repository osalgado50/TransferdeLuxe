"use client";
import { useEffect, useState } from "react";

/** Destino que va cambiando en el titular («Tu traslado privado a PortAventura… el aeropuerto… Barcelona»). */
export default function DestinoRotativo({ destinos }: { destinos: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % destinos.length), 2400);
    return () => clearInterval(t);
  }, [destinos.length]);
  return (
    <span className="block min-h-[1.15em] [perspective:600px]" aria-live="off">
      <span key={i} className="tvl-palabra bg-gradient-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">
        {destinos[i]}
      </span>
      {/* Para lectores de pantalla, la lista entera una sola vez */}
      <span className="sr-only">{destinos.join(", ")}</span>
    </span>
  );
}
