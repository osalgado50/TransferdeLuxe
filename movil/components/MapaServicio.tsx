import { distanciaKm } from "@dominio/geo";
import {
  claveAvisoNav, debePedirRuta, faseProximidad, REINTENTO_LLEGANDO_MS, restanteEnRuta, textoAvisoProximidad, textoBannerRuta,
  tiempoRestanteS, type Fase, type Objetivo, type PeticionRuta,
} from "@dominio/navegacion";
import type { Punto } from "@dominio/tipos";
import { Camera, GeoJSONSource, Layer, Map as MapaLibre, Marker, type CameraRef, type StyleSpecification } from "@maplibre/maplibre-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { llamarApi } from "~/lib/api";
import { notificarLocal } from "~/lib/push";
import { color } from "~/lib/tema";

interface Ruta { coords: [number, number][]; distanciaM: number; duracionS: number; fuente: "osrm" | "recta" }

// Estilo raster de OpenStreetMap: sin claves ni proveedor de pago.
const ESTILO: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const VERDE = "#22c55e", ROJO = "#ef4444", AZUL = "#3b82f6";
const lngLat = (p: Punto): [number, number] => [p.lng, p.lat];
const linea = (coords: [number, number][]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } });

/** Avisos «una sola vez» por servicio + objetivo, persistentes entre aperturas de la pantalla. */
async function primeraVez(clave: string): Promise<boolean> {
  try { if (await AsyncStorage.getItem(clave)) return false; await AsyncStorage.setItem(clave, "1"); } catch { /* sin almacenamiento */ }
  return true;
}

export function MapaServicio({ servicioId, objetivo, origenServicio, alCambiarFase }: {
  servicioId: string; objetivo: Objetivo; origenServicio: Punto | null; alCambiarFase?: (f: Fase) => void;
}) {
  const [pos, setPos] = useState<Punto | null>(null);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [seguir, setSeguir] = useState(true);
  const [fase, setFase] = useState<Fase>("lejos");
  const camara = useRef<CameraRef>(null);
  const pedida = useRef<PeticionRuta | null>(null);
  const enviando = useRef(false);
  const ultimoIntento = useRef(0);
  const claveObj = `${objetivo.tipo}:${objetivo.punto.lat},${objetivo.punto.lng}`;

  // GPS propio de la pantalla (independiente de la tarea en segundo plano y del interruptor «En servicio»).
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null, vivo = true;
    (async () => {
      const p = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!vivo) return;
      if (!p?.granted) { setAvisoGps("Permite la ubicación para ver tu posición y la distancia restante"); return; }
      setAvisoGps("Buscando señal GPS…");
      const s = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
        (l) => { setAvisoGps(null); setPos({ lat: l.coords.latitude, lng: l.coords.longitude }); });
      if (vivo) sub = s; else s.remove();
    })().catch(() => { if (vivo) setAvisoGps("No se pudo leer el GPS"); });
    return () => { vivo = false; sub?.remove(); };
  }, []);

  const restante = useMemo(() => (ruta && pos ? restanteEnRuta(ruta.coords, pos) : null), [ruta, pos]);

  // Ruta: al cambiar el objetivo, con el primer fix, o si se desvía > 300 m (como mucho 1 vez / 30 s).
  const pedir = useCallback(async (o: Punto, clave: string) => {
    try {
      const r = await llamarApi(`/api/ruta?o=${o.lat.toFixed(5)},${o.lng.toFixed(5)}&d=${objetivo.punto.lat},${objetivo.punto.lng}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as Ruta;
      if (pedida.current?.clave === clave) setRuta(j);
    } catch { pedida.current = null; /* sin red: se reintenta con el siguiente fix */ }
  }, [objetivo.punto.lat, objetivo.punto.lng]);
  useEffect(() => {
    const origen = pos ?? (objetivo.tipo === "destino" ? origenServicio : null);
    if (!origen) return;
    const ahora = Date.now();
    if (!debePedirRuta(pedida.current, claveObj, !!pos, restante?.desvioM ?? null, ahora)) return;
    if (pedida.current?.clave !== claveObj) setRuta(null);
    pedida.current = { clave: claveObj, t: ahora, conPos: !!pos };
    void pedir(origen, claveObj);
  }, [pos, restante, claveObj, objetivo.tipo, origenServicio, pedir]);

  // Proximidad con histéresis (distancia en línea recta al objetivo).
  const distObj = pos ? distanciaKm(pos, objetivo.punto) * 1000 : null;
  useEffect(() => { setFase("lejos"); }, [claveObj]);
  useEffect(() => { if (distObj != null) setFase((f) => faseProximidad(distObj, f)); }, [distObj]);
  useEffect(() => { alCambiarFase?.(fase); }, [fase, alCambiarFase]);
  useEffect(() => {
    if (fase === "lejos") return;
    // Aviso «llegando» a la central: solo se marca como enviado si el servidor responde ok; reintento ≥ 15 s.
    void (async () => {
      const central = claveAvisoNav(servicioId, objetivo.tipo, "central");
      if (enviando.current || Date.now() - ultimoIntento.current < REINTENTO_LLEGANDO_MS) return;
      if (await AsyncStorage.getItem(central).catch(() => null)) return;
      enviando.current = true; ultimoIntento.current = Date.now();
      try {
        const r = await llamarApi("/api/conductor/llegando", { method: "POST", body: { servicioId, objetivo: objetivo.tipo } });
        if (r.ok) await AsyncStorage.setItem(central, "1").catch(() => undefined);
      } catch { /* sin red: se reintenta con un fix posterior */ } finally { enviando.current = false; }
    })();
    void (async () => {
      if (!(await primeraVez(claveAvisoNav(servicioId, objetivo.tipo, fase)))) return;
      void Haptics.notificationAsync(fase === "llegado" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      await notificarLocal(fase === "llegado" ? "Has llegado" : "Estás llegando", textoAvisoProximidad(fase, objetivo.tipo, distObj));
    })();
  }, [fase, servicioId, objetivo.tipo, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seguimiento automático hasta que el conductor mueva el mapa.
  useEffect(() => {
    if (seguir && pos) camara.current?.easeTo({ center: lngLat(pos), duration: 600 });
  }, [seguir, pos]);

  const quedaM = restante?.restanteM ?? distObj ?? ruta?.distanciaM ?? null;
  const quedaS = tiempoRestanteS(ruta, quedaM);
  const colorObj = objetivo.tipo === "recogida" ? VERDE : ROJO;
  const inicio = ruta?.coords[0], fin = ruta?.coords[ruta.coords.length - 1];
  const conectores = {
    type: "FeatureCollection" as const,
    features: [
      ...(pos && inicio ? [linea([lngLat(pos), [inicio[1], inicio[0]]])] : []),
      ...(fin ? [linea([[fin[1], fin[0]], lngLat(objetivo.punto)])] : []),
    ],
  };

  return (
    <View style={estilos.caja}>
      {fase !== "lejos" && (
        <View accessibilityRole="alert" style={[estilos.alerta, { backgroundColor: fase === "llegado" ? VERDE : "#fbbf24" }]}>
          <Text style={estilos.alertaTexto}>{textoAvisoProximidad(fase, objetivo.tipo, distObj)}</Text>
        </View>
      )}
      <View style={estilos.mapa}>
        <MapaLibre style={StyleSheet.absoluteFill} mapStyle={ESTILO} attribution logo={false}
          onRegionWillChange={(e) => { if (e.nativeEvent.userInteraction) setSeguir(false); }}>
          <Camera ref={camara} initialViewState={{ center: lngLat(objetivo.punto), zoom: 14 }} />
          {ruta && (
            <GeoJSONSource id="ruta" data={linea(ruta.coords.map(([lat, lng]) => [lng, lat]))}>
              <Layer id="ruta-borde" type="line" style={{ lineColor: "#1e3a8a", lineWidth: 8, lineCap: "round", lineJoin: "round" }} />
              <Layer id="ruta-linea" type="line" style={{ lineColor: AZUL, lineWidth: 5, lineCap: "round", lineJoin: "round" }} />
            </GeoJSONSource>
          )}
          <GeoJSONSource id="conectores" data={conectores}>
            <Layer id="conectores-linea" type="line" style={{ lineColor: AZUL, lineWidth: 3, lineDasharray: [1, 2] }} />
          </GeoJSONSource>
          <Marker id="objetivo" lngLat={lngLat(objetivo.punto)} anchor="center">
            <View style={[estilos.objetivo, { backgroundColor: colorObj }]} accessibilityLabel={objetivo.tipo === "recogida" ? "Recogida" : "Destino"} />
          </Marker>
          {pos ? (
            <Marker id="yo" lngLat={lngLat(pos)} anchor="center">
              <View style={estilos.yo} accessibilityLabel="Tu posición" />
            </Marker>
          ) : null}
        </MapaLibre>
        <View style={estilos.banner} pointerEvents="none">
          <Text style={estilos.bannerTexto}>{textoBannerRuta(objetivo.tipo, quedaM, quedaS)}</Text>
          {ruta?.fuente === "recta" && <Text style={estilos.bannerAviso}>Ruta aproximada (sin servicio de rutas)</Text>}
        </View>
        {pos && !seguir && (
          <Pressable onPress={() => setSeguir(true)} accessibilityRole="button" accessibilityLabel="Centrar en mi posición" style={estilos.centrar}>
            <Text style={estilos.centrarTexto}>Centrar</Text>
          </Pressable>
        )}
      </View>
      {avisoGps && <Text accessibilityRole="text" style={estilos.avisoGps}>{avisoGps}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { gap: 8 },
  alerta: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  alertaTexto: { color: "#0f172a", fontSize: 18, fontWeight: "800", textAlign: "center" },
  mapa: { height: 320, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: color.borde },
  banner: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(2,6,23,0.88)", paddingHorizontal: 12, paddingVertical: 8 },
  bannerTexto: { color: "#fff", fontSize: 16, fontWeight: "700" },
  bannerAviso: { color: "#fcd34d", fontSize: 12 },
  centrar: { position: "absolute", right: 12, bottom: 12, minHeight: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: "#2563eb", justifyContent: "center" },
  centrarTexto: { color: "#fff", fontSize: 16, fontWeight: "800" },
  objetivo: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: "#fff" },
  yo: { width: 20, height: 20, borderRadius: 10, backgroundColor: AZUL, borderWidth: 3, borderColor: "#fff" },
  avisoGps: { backgroundColor: "#dc2626", color: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: "600" },
});
