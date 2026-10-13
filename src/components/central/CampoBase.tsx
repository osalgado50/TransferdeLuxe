"use client";
import { useState } from "react";
import CampoDireccion from "@/components/comun/CampoDireccion";

/**
 * «Base / depósito» con el autocompletado de direcciones: guarda texto y coordenadas (base_texto, base_lat, base_lng).
 * Arranca con las coordenadas guardadas para que guardar sin tocar nada no las borre.
 */
export default function CampoBase({ texto, lat, lng }: { texto: string | null; lat: number | null; lng: number | null }) {
  const [relleno] = useState(() => (texto ? { n: 1, texto, lat, lng } : undefined));
  const [dir, setDir] = useState({ texto: texto ?? "", lat: lat == null ? "" : String(lat), lng: lng == null ? "" : String(lng) });
  return (
    <div className="w-full max-w-xl space-y-1">
      <CampoDireccion name="base" etiqueta="Base / depósito (elígela de la lista para fijar las coordenadas)" valorInicial={texto ?? ""} rellenar={relleno} onCambio={setDir} />
      {dir.texto.trim() !== "" && dir.lat === "" && (
        <p className="text-xs text-amber-300">Sin coordenadas: elige una sugerencia de la lista para poder calcular el traslado desde y hasta la base.</p>
      )}
    </div>
  );
}
