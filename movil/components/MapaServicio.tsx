import { distanciaKm } from "@dominio/geo";
import {
  claveAvisoNav, debePedirRuta, faseProximidad, REINTENTO_LLEGANDO_MS, REPETIR_RUTA_MS, restanteEnRuta, textoAvisoProximidad, textoBannerRuta,
  tiempoRestanteS, type Fase, type Objetivo, type PeticionRuta,
} from "@dominio/navegacion";
import { clasificarRespuesta, esperaBackoff } from "@dominio/reintento";
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

export function MapaServicio({ servicioId, objetivo, origenServicio, alCambiarFase, alCambiarEta }: {
  servicioId: string; objetivo: Objetivo; origenServicio: Punto | null; alCambiarFase?: (f: Fase) => void;
  /** Segundos restantes de la ruta (los del banner), redondeados a 15 s; null sin ruta. Al desmontar, null. */
  alCambiarEta?: (s: number | null) => void;
}) {
  const [pos, setPos] = useState<Punto | null>(null);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [seguir, setSeguir] = useState(true);
  const [fase, setFase] = useState<Fase>("lejos");
  const camara = useRef<CameraRef>(null);
  const pedida = useRef<PeticionRuta | null>(null);
  const fallo = useRef<{ clave: string; t: number } | null>(null);
  const ultimoEase = useRef(0);
  // Avisos ya disparados (en memoria, actualizado antes de cualquier await); AsyncStorage solo como carga inicial.
  const disparados = useRef<Set<string>>(new Set());
  const [cargado, setCargado] = useState(false);
  const enviando = useRef(false);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const distRef = useRef<number | null>(null);
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
    } catch {
      // Sin red: se reintenta pasados ≥ 30 s (no en cada fix).
      fallo.current = { clave, t: Date.now() };
      if (pedida.current?.clave === clave) pedida.current = null;
    }
  }, [objetivo.punto.lat, objetivo.punto.lng]);
  useEffect(() => {
    const origen = pos ?? (objetivo.tipo === "destino" ? origenServicio : null);
    if (!origen) return;
    const ahora = Date.now();
    if (fallo.current?.clave === claveObj && ahora - fallo.current.t < REPETIR_RUTA_MS) return;
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
  distRef.current = distObj;
  const claves = useMemo(() => ({
    cerca: claveAvisoNav(servicioId, objetivo.tipo, "cerca"),
    llegado: claveAvisoNav(servicioId, objetivo.tipo, "llegado"),
    central: claveAvisoNav(servicioId, objetivo.tipo, "central"),
  }), [servicioId, objetivo.tipo]);
  useEffect(() => {
    let vivo = true;
    void AsyncStorage.multiGet(Object.values(claves)).then((pares) => pares, () => [] as [string, string | null][]).then((pares) => {
      if (!vivo) return;
      for (const [k, v] of pares) if (v) disparados.current.add(k);
      setCargado(true);
    });
    return () => { vivo = false; };
  }, [claves]);
  const marcar = (k: string) => { disparados.current.add(k); void AsyncStorage.setItem(k, "1").catch(() => undefined); };

  // Aviso «llegando» a la central: solo se marca con respuesta ok (o un rechazo definitivo 4xx: no tiene sentido insistir);
  // si falla la red o el servidor, reintento con backoff (15 s, 30 s, 60 s… hasta 5 min), nunca en caliente.
  const fallosLlegando = useRef(0);
  const avisarCentral = useCallback(async () => {
    reintento.current = null;
    if (enviando.current || disparados.current.has(claves.central)) return;
    enviando.current = true;
    let fin = false;
    try {
      const r = await llamarApi("/api/conductor/llegando", { method: "POST", body: { servicioId, objetivo: objetivo.tipo } });
      fin = r.ok || clasificarRespuesta(r.status, r.headers.get("content-type")) === "ok";
    } catch { /* sin red */ } finally { enviando.current = false; }
    if (fin) { fallosLlegando.current = 0; marcar(claves.central); return; }
    const espera = esperaBackoff(++fallosLlegando.current, { baseMs: REINTENTO_LLEGANDO_MS, topeMs: 5 * 60_000 });
    if (!reintento.current) reintento.current = setTimeout(() => void avisarCentral(), Math.max(REINTENTO_LLEGANDO_MS, espera));
  }, [claves, servicioId, objetivo.tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (reintento.current) clearTimeout(reintento.current); }, []);

  useEffect(() => {
    if (!cargado || fase === "lejos") return;
    if (!reintento.current) void avisarCentral();
    const k = claves[fase];
    if (disparados.current.has(k)) return;
    marcar(k); // síncrono: no puede dispararse dos veces
    void Haptics.notificationAsync(fase === "llegado" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    void notificarLocal(fase === "llegado" ? "Has llegado" : "Estás llegando", textoAvisoProximidad(fase, objetivo.tipo, distRef.current));
  }, [fase, cargado, claves, objetivo.tipo, avisarCentral]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seguimiento automático hasta que el conductor mueva el mapa (como mucho cada 1,5 s).
  useEffect(() => {
    if (!seguir || !pos) return;
    const ahora = Date.now();
    if (ahora - ultimoEase.current < 1500) return;
    ultimoEase.current = ahora;
    camara.current?.easeTo({ center: lngLat(pos), duration: 600 });
  }, [seguir, pos]);
  useEffect(() => { if (seguir) ultimoEase.current = 0; }, [seguir]);

  const quedaM = restante?.restanteM ?? distObj ?? ruta?.distanciaM ?? null;
  const quedaS = tiempoRestanteS(ruta, quedaM);
  // ETA para el contador de puntualidad: redondeada a 15 s para no re-renderizar la pantalla en cada fix del GPS.
  const etaRedondeada = quedaS == null ? null : Math.round(quedaS / 15) * 15;
  useEffect(() => { alCambiarEta?.(etaRedondeada); }, [etaRedondeada, alCambiarEta]);
  useEffect(() => () => alCambiarEta?.(null), [alCambiarEta]);
  const colorObj = objetivo.tipo === "recogida" ? VERDE : ROJO;
  const inicio = ruta?.coords[0], fin = ruta?.coords[ruta.coords.length - 1];
  const geoRuta = useMemo(() => (ruta ? linea(ruta.coords.map(([lat, lng]) => [lng, lat])) : null), [ruta]);
  const conectores = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: [
      ...(pos && inicio ? [linea([lngLat(pos), [inicio[1], inicio[0]]])] : []),
      ...(fin ? [linea([[fin[1], fin[0]], lngLat(objetivo.punto)])] : []),
    ],
  }), [pos, inicio, fin, objetivo.punto]);

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
          {geoRuta && (
            <GeoJSONSource id="ruta" data={geoRuta}>
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
