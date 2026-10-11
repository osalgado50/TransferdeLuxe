// Web (solo vista previa de diseño): el mapa nativo MapLibre no existe en la web; se muestra el dibujo grande.
import type { PuntoLngLat } from "@dominio/recorrido";
import { MiniRecorrido } from "~/components/MiniRecorrido";

export function MapaRecorrido({ puntos, corte }: { puntos: PuntoLngLat[]; corte: number | null; alto?: number }) {
  return <MiniRecorrido puntos={puntos} corte={corte} ancho={340} alto={260} />;
}
