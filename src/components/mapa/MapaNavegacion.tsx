"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, ZoomControl, TileLayer, CircleMarker, Circle, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { difAngulo, prepararRuta, rumboCoche, rumboRutaEn, siguienteGiro, situarEnRuta, zoomNavegacion } from "@/lib/dominio/rumbo";
import type { Punto } from "@/lib/dominio/tipos";
import type { TipoObjetivo } from "@/lib/dominio/navegacion";

export interface PropsMapaNavegacion {
  pos: (Punto & { precision: number; rumbo?: number | null; velocidad?: number | null }) | null;
  objetivo: { tipo: TipoObjetivo; punto: Punto };
  coords: [number, number][] | null;
  seguir: boolean;
  onPan: () => void;
}

function Control({ pos, objetivo, coords, seguir, onPan, zoom }: PropsMapaNavegacion & { zoom: number }) {
  const map = useMap();
  const encuadrado = useRef(false);
  useMapEvents({ dragstart: onPan });
  // Sigue al coche con el zoom de navegación: de cerca al llegar a un cruce o giro, más lejos en carretera rápida.
  useEffect(() => {
    if (seguir && pos) { map.setView([pos.lat, pos.lng], Math.round(zoom), { animate: true }); encuadrado.current = true; }
  }, [map, pos, seguir, zoom]);
  useEffect(() => {
    if (encuadrado.current || pos) return;
    const pts: [number, number][] = coords && coords.length > 1 ? coords : [[objetivo.punto.lat, objetivo.punto.lng]];
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] }); else map.setView(pts[0], 15);
  }, [map, coords, objetivo, pos]);
  return null;
}

/** Coche con flecha en el sentido de la marcha (en la web el mapa va con el norte arriba: gira la flecha). */
const flecha = (grados: number) => L.divIcon({
  className: "", iconSize: [34, 34], iconAnchor: [17, 17],
  html: `<div style="width:34px;height:34px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;transform:rotate(${Math.round(grados)}deg)"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#fff"/></svg></div>`,
});

export default function MapaNavegacion(p: PropsMapaNavegacion) {
  const { pos, objetivo, coords } = p;
  const color = objetivo.tipo === "recogida" ? "#16a34a" : "#dc2626";
  // Rumbo del coche y próximo giro sobre la ruta (misma lógica que la app).
  const recorrido = useMemo(() => (coords && coords.length > 1 ? prepararRuta(coords) : null), [coords]);
  const [rumbo, setRumbo] = useState<number | null>(null);
  const nav = useMemo(() => {
    if (!pos) return null;
    const sit = recorrido ? situarEnRuta(recorrido, pos) : null;
    return { rumboRuta: recorrido && sit ? rumboRutaEn(recorrido, sit.s) : null, desvioM: sit?.desvioM ?? null,
      giro: recorrido && sit && sit.desvioM < 60 ? siguienteGiro(recorrido, sit.s) : null };
  }, [pos, recorrido]);
  useEffect(() => {
    if (!nav) return;
    setRumbo((ant) => {
      const r = rumboCoche({ gps: pos?.rumbo ?? null, velocidadMs: pos?.velocidad ?? null, ruta: nav.rumboRuta, desvioM: nav.desvioM, anterior: ant });
      return r != null && (ant == null || Math.abs(difAngulo(ant, r)) >= 5) ? r : ant;
    });
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = zoomNavegacion({ velocidadKmh: pos?.velocidad != null && pos.velocidad >= 0 ? pos.velocidad * 3.6 : null, giroM: nav?.giro?.distanciaM ?? null });
  const icono = useMemo(() => (rumbo == null ? null : flecha(rumbo)), [rumbo]);
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
      {pos && (icono
        ? <Marker position={[pos.lat, pos.lng]} icon={icono} interactive={false} keyboard={false} />
        : <CircleMarker center={[pos.lat, pos.lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }} />)}
      <ZoomControl position="topright" />
      <Control {...p} zoom={zoom} />
    </MapContainer>
  );
}
