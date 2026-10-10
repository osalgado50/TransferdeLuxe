"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { MapContainer, ZoomControl, TileLayer, CircleMarker, Circle, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Punto } from "@/lib/dominio/tipos";
import type { TipoObjetivo } from "@/lib/dominio/navegacion";

export interface PropsMapaNavegacion {
  pos: (Punto & { precision: number }) | null;
  objetivo: { tipo: TipoObjetivo; punto: Punto };
  coords: [number, number][] | null;
  seguir: boolean;
  onPan: () => void;
}

function Control({ pos, objetivo, coords, seguir, onPan }: PropsMapaNavegacion) {
  const map = useMap();
  const encuadrado = useRef(false);
  useMapEvents({ dragstart: onPan });
  useEffect(() => {
    if (seguir && pos) { map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { animate: true }); encuadrado.current = true; }
  }, [map, pos, seguir]);
  useEffect(() => {
    if (encuadrado.current || pos) return;
    const pts: [number, number][] = coords && coords.length > 1 ? coords : [[objetivo.punto.lat, objetivo.punto.lng]];
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] }); else map.setView(pts[0], 15);
  }, [map, coords, objetivo, pos]);
  return null;
}

export default function MapaNavegacion(p: PropsMapaNavegacion) {
  const { pos, objetivo, coords } = p;
  const color = objetivo.tipo === "recogida" ? "#16a34a" : "#dc2626";
  return (
    <MapContainer center={[objetivo.punto.lat, objetivo.punto.lng]} zoom={14} zoomControl={false} fadeAnimation={false} className="mapa-nav h-[55vh] w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {coords && coords.length > 1 && pos && <Polyline positions={[[pos.lat, pos.lng], coords[0]]} pathOptions={{ color: "#2563eb", weight: 4, dashArray: "6 8" }} />}
      {coords && coords.length > 1 && <Polyline positions={[coords[coords.length - 1], [objetivo.punto.lat, objetivo.punto.lng]]} pathOptions={{ color: "#2563eb", weight: 4, dashArray: "6 8" }} />}
      {coords && coords.length > 1 && <Polyline positions={coords} pathOptions={{ color: "#2563eb", weight: 6, opacity: 0.85 }} />}
      <CircleMarker center={[objetivo.punto.lat, objetivo.punto.lng]} radius={11} pathOptions={{ color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -10]}>{objetivo.tipo === "recogida" ? "Recogida" : "Destino"}</Tooltip>
      </CircleMarker>
      {pos && <Circle center={[pos.lat, pos.lng]} radius={pos.precision} pathOptions={{ color: "#3b82f6", weight: 1, fillOpacity: 0.15 }} />}
      {pos && <CircleMarker center={[pos.lat, pos.lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }} />}
      <ZoomControl position="topright" />
      <Control {...p} />
    </MapContainer>
  );
}
