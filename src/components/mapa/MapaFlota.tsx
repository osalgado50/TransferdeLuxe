"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { llegandoReciente } from "@/lib/dominio/navegacion";
import { COLOR_ESTADO_MAPA, estadoEnMapa, type EstadoVehiculoMapa } from "@/lib/dominio/mapa";
import type { PosicionActual, Servicio, Perfil, Vehiculo } from "@/lib/dominio/tipos";

const COLOR = COLOR_ESTADO_MAPA; // mismos colores que la app
const TEXTO: Record<EstadoVehiculoMapa, string> = { libre: "Libre", en_camino: "En camino", con_pasajeros: "Con pasajeros", sin_senal: "Sin señal" };
const ACTIVOS = ["asignado", "aceptado", "en_camino", "recogido"];

function icono(color: string, inicial: string) {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${color};color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:600 13px sans-serif">${inicial}</div>`,
  });
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/** Centra el mapa en un punto (p. ej. «Ver en el mapa» de una avería). `n` cambia en cada petición. */
function Centrar({ c }: { c?: { lat: number; lng: number; n: number } | null }) {
  const map = useMap();
  useEffect(() => { if (c) map.flyTo([c.lat, c.lng], 14); }, [c, map]);
  return null;
}

/**
 * Marcador que se desliza hasta su nueva posición en vez de saltar: recorre el tramo en el tiempo que tardó en llegar
 * la actualización (como mucho 45 s), así el coche parece moverse sin parar. Saltos grandes (más de ~3 km, p. ej. un
 * GPS que vuelve) y «reducir movimiento»: directo, sin animación.
 */
function MarcadorSuave({ lat, lng, icon, children }: { lat: number; lng: number; icon: L.DivIcon; children: ReactNode }) {
  const ref = useRef<L.Marker>(null);
  const [inicial] = useState<[number, number]>(() => [lat, lng]); // posición fija para react-leaflet: la mueve la animación
  const visto = useRef<{ pos: [number, number]; t: number }>({ pos: [lat, lng], t: performance.now() });
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const desde = m.getLatLng(), hasta: [number, number] = [lat, lng];
    const ahora = performance.now();
    const dur = Math.min(45_000, Math.max(800, ahora - visto.current.t));
    visto.current = { pos: hasta, t: ahora };
    const lejos = Math.abs(desde.lat - lat) + Math.abs(desde.lng - lng) > 0.03;
    if (lejos || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { m.setLatLng(hasta); return; }
    let raf = 0;
    const paso = (ts: number) => {
      const f = Math.min(1, (ts - ahora) / dur);
      m.setLatLng([desde.lat + (lat - desde.lat) * f, desde.lng + (lng - desde.lng) * f]);
      if (f < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [lat, lng]);
  return <Marker ref={ref} position={inicial} icon={icon}>{children}</Marker>;
}

export default function MapaFlota({ posiciones, servicios, conductores, vehiculos, umbralMin, eventos = [], centrar }: {
  posiciones: PosicionActual[]; servicios: Servicio[]; conductores: Pick<Perfil, "id" | "nombre" | "vehiculo_habitual_id">[];
  vehiculos: Pick<Vehiculo, "id" | "matricula">[]; umbralMin: number;
  eventos?: { servicio_id: string; tipo: string; creado_en: string }[];
  centrar?: { lat: number; lng: number; n: number } | null;
}) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);

  const marcadores = useMemo(() => posiciones.map((p) => {
    const c = conductores.find((x) => x.id === p.conductor_id);
    const mios = servicios.filter((s) => s.conductor_id === p.conductor_id && ACTIVOS.includes(s.estado))
      .sort((a, b) => a.fecha_hora_recogida.localeCompare(b.fecha_hora_recogida));
    const actual = mios.find((s) => s.estado === "en_camino" || s.estado === "recogido");
    const siguiente = mios.find((s) => s !== actual);
    const estado = estadoEnMapa(p, actual, ahora, umbralMin);
    const veh = vehiculos.find((v) => v.id === c?.vehiculo_habitual_id);
    const min = Math.max(0, Math.round((ahora.getTime() - new Date(p.registrado_en).getTime()) / 60_000));
    const llegando = mios.some((s) => llegandoReciente(eventos, s, ahora));
    return { p, llegando, nombre: c?.nombre ?? "Conductor", matricula: veh?.matricula ?? "—", estado, actual, siguiente, min };
  }), [posiciones, servicios, conductores, vehiculos, ahora, umbralMin, eventos]);

  return (
    <div className="space-y-2">
    <MapContainer center={[41.0763, 1.1416]} zoom={11} className="h-[60vh] min-h-[22rem] w-full lg:h-[calc(100vh-15rem)] lg:min-h-[32rem] rounded-lg">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      <Centrar c={centrar} />
      {marcadores.map((m) => (
        <MarcadorSuave key={m.p.conductor_id} lat={m.p.lat} lng={m.p.lng} icon={icono(COLOR[m.estado], m.nombre.charAt(0).toUpperCase())}>
          <Popup>
            <strong>{m.nombre}</strong><br />
            {m.matricula} · {TEXTO[m.estado]}{m.llegando && <> · <strong style={{ color: "#16a34a" }}>Llegando</strong></>}<br />
            Actual: {m.actual ? `${m.actual.origen_texto} → ${m.actual.destino_texto}` : "—"}<br />
            Siguiente: {m.siguiente ? `${hora(m.siguiente.fecha_hora_recogida)} ${m.siguiente.origen_texto}` : "—"}<br />
            <span>hace {m.min} min</span>
          </Popup>
        </MarcadorSuave>
      ))}
    </MapContainer>
    <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-300" aria-label="Leyenda de colores">
      {(Object.keys(TEXTO) as EstadoVehiculoMapa[]).map((e) => (
        <li key={e} className="flex items-center gap-2"><span className="size-3.5 rounded-full border border-white/70" style={{ background: COLOR[e] }} />{TEXTO[e]}</li>
      ))}
    </ul>
    </div>
  );
}
