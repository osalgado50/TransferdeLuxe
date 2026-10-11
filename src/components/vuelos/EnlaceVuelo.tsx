"use client";
import { urlVuelo } from "@/lib/dominio/vuelos";

/** Enlace «Ver vuelo» a Flightradar24 (pestaña nueva). */
export default function EnlaceVuelo({ codigo, className = "" }: { codigo: string | null | undefined; className?: string }) {
  if (!codigo) return null;
  return (
    <a href={urlVuelo(codigo)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={`text-marca-claro underline-offset-2 hover:underline ${className}`}>Ver vuelo {codigo} ↗</a>
  );
}
