"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

/** Sigue al coche: recentra el mapa cuando cambia la posición (sin cambiar el zoom que haya elegido el cliente). */
function Seguir({ lat, lng }: { lat: number; lng: number }) {
  const mapa = useMap();
  useEffect(() => { mapa.panTo([lat, lng], { animate: true }); }, [mapa, lat, lng]);
  return null;
}

/** Mapa de la página de seguimiento: SOLO el coche (sin recogida, destino ni nada del cliente). */
export default function MapaSeguimiento({ lat, lng, etiqueta }: { lat: number; lng: number; etiqueta: string }) {
  return (
    <MapContainer center={[lat, lng]} zoom={14} className="h-72 w-full rounded-2xl" scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      <CircleMarker center={[lat, lng]} radius={11} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2a75a8", fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -10]}>{etiqueta}</Tooltip>
      </CircleMarker>
      <Seguir lat={lat} lng={lng} />
    </MapContainer>
  );
}
