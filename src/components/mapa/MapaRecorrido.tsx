"use client";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from "react-leaflet";
import { COLOR_CON, COLOR_HACIA, tramosRecorrido, type PuntoLngLat } from "@/lib/dominio/recorrido";

const ll = (p: PuntoLngLat): [number, number] => [p[1], p[0]];

/** Recorrido real del conductor: azul hacia la recogida, rojo con pasajeros; inicio, recogida y fin. */
export default function MapaRecorrido({ puntos, corte, alto = "h-80" }: { puntos: PuntoLngLat[]; corte: number | null; alto?: string }) {
  const { hacia, con } = tramosRecorrido(puntos, corte);
  const lats = puntos.map((p) => p[1]), lngs = puntos.map((p) => p[0]);
  const limites: [[number, number], [number, number]] = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  const ini = puntos[0], fin = puntos[puntos.length - 1], rec = corte != null && hacia.length ? hacia[hacia.length - 1] : null;
  return (
    <MapContainer bounds={limites} boundsOptions={{ padding: [24, 24] }} className={`${alto} w-full rounded-lg`}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {hacia.length > 1 && <Polyline positions={hacia.map(ll)} pathOptions={{ color: COLOR_HACIA, weight: 5, opacity: 0.9 }} />}
      {con.length > 1 && <Polyline positions={con.map(ll)} pathOptions={{ color: COLOR_CON, weight: 5, opacity: 0.9 }} />}
      <CircleMarker center={ll(ini)} radius={7} pathOptions={{ color: "#334155", fillColor: "#fff", fillOpacity: 1 }}><Tooltip>Inicio (en camino)</Tooltip></CircleMarker>
      {rec && <CircleMarker center={ll(rec)} radius={8} pathOptions={{ color: "#fff", fillColor: "#16a34a", fillOpacity: 1 }}><Tooltip>Recogida</Tooltip></CircleMarker>}
      <CircleMarker center={ll(fin)} radius={8} pathOptions={{ color: "#fff", fillColor: "#dc2626", fillOpacity: 1 }}><Tooltip>Destino (completado)</Tooltip></CircleMarker>
    </MapContainer>
  );
}
