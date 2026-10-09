"use client";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from "react-leaflet";
import type { Punto } from "@/lib/dominio/tipos";

export default function MapaTrayecto({ origen, destino }: { origen: Punto | null; destino: Punto | null }) {
  const centro = origen ?? destino ?? { lat: 41.0763, lng: 1.1416 };
  return (
    <MapContainer center={[centro.lat, centro.lng]} zoom={11} className="h-64 w-full rounded-lg">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {origen && <CircleMarker center={[origen.lat, origen.lng]} radius={8} pathOptions={{ color: "#16a34a" }}><Tooltip>Recogida</Tooltip></CircleMarker>}
      {destino && <CircleMarker center={[destino.lat, destino.lng]} radius={8} pathOptions={{ color: "#dc2626" }}><Tooltip>Destino</Tooltip></CircleMarker>}
      {origen && destino && <Polyline positions={[[origen.lat, origen.lng], [destino.lat, destino.lng]]} pathOptions={{ dashArray: "6" }} />}
    </MapContainer>
  );
}
