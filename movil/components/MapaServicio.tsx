import { distanciaKm } from "@dominio/geo";
import {
  claveAvisoNav, debePedirRuta, faseProximidad, REINTENTO_LLEGANDO_MS, REPETIR_RUTA_MS, restanteEnRuta, textoAvisoProximidad, textoBannerRuta,
  tiempoRestanteS, type Fase, type Objetivo, type PeticionRuta,
} from "@dominio/navegacion";
import { clasificarRespuesta, esperaBackoff } from "@dominio/reintento";
import { difAngulo, prepararRuta, rumboCoche, rumboRutaEn, siguienteGiro, situarEnRuta, zoomNavegacion } from "@dominio/rumbo";
import type { Punto } from "@dominio/tipos";
import { Camera, GeoJSONSource, Layer, Map as MapaLibre, Marker, type CameraRef, type StyleSpecification } from "@maplibre/maplibre-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
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

export function MapaServicio({ servicioId, objetivo, origenServicio, alCambiarFase, alCambiarEta, alCambiarDistancia }: {
  servicioId: string; objetivo: Objetivo; origenServicio: Punto | null; alCambiarFase?: (f: Fase) => void;
  /** Segundos restantes de la ruta (los del banner), redondeados a 15 s; null sin ruta. Al desmontar, null. */
  alCambiarEta?: (s: number | null) => void;
  /** Distancia en línea recta al objetivo (m, redondeada a 10 m); null sin GPS. Al desmontar, null. Para confirmar CARGA/DESCARGA lejos. */
  alCambiarDistancia?: (m: number | null) => void;
}) {
  const [pos, setPos] = useState<Punto | null>(null);
  /** Rumbo (grados) y velocidad (m/s) que da el GPS con cada posición; -1 / null si no los sabe. */
  const gps = useRef<{ rumbo: number | null; velocidad: number | null }>({ rumbo: null, velocidad: null });
  /** Rumbo del coche (el mapa gira con él) y giro del mapa ahora mismo (para orientar la flecha si se ha movido a mano). */
  const [rumboAhora, setRumboAhora] = useState<number | null>(null);
  const [giroMapa, setGiroMapa] = useState(0);
  /** Mapa a pantalla completa (al tocarlo) y zoom actual del mapa (para los botones + / −). */
  const [completa, setCompleta] = useState(false);
  const [zoomMapa, setZoomMapa] = useState(14);
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
        (l) => {
          setAvisoGps(null);
          gps.current = { rumbo: l.coords.heading ?? null, velocidad: l.coords.speed ?? null };
          setPos({ lat: l.coords.latitude, lng: l.coords.longitude });
        });
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
  const distRedondeada = distObj == null ? null : Math.round(distObj / 10) * 10;
  useEffect(() => { alCambiarDistancia?.(distRedondeada); }, [distRedondeada, alCambiarDistancia]);
  useEffect(() => () => alCambiarDistancia?.(null), [alCambiarDistancia]);
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

  // Navegación «rumbo arriba»: dónde va el coche sobre la ruta, hacia dónde mira y a cuánto está el próximo cruce o giro.
  const recorrido = useMemo(() => (ruta && ruta.coords.length > 1 ? prepararRuta(ruta.coords) : null), [ruta]);
  const nav = useMemo(() => {
    if (!pos) return null;
    const sit = recorrido ? situarEnRuta(recorrido, pos) : null;
    const sobreRuta = !!sit && sit.desvioM < 60;
    return {
      rumboRuta: recorrido && sit ? rumboRutaEn(recorrido, sit.s) : null,
      desvioM: sit?.desvioM ?? null,
      giro: recorrido && sit && sobreRuta ? siguienteGiro(recorrido, sit.s) : null,
    };
  }, [pos, recorrido]);
  useEffect(() => {
    if (!nav) return;
    const r = rumboCoche({ gps: gps.current.rumbo, velocidadMs: gps.current.velocidad, ruta: nav.rumboRuta, desvioM: nav.desvioM, anterior: rumboAhora });
    // Cambios de menos de 5° no giran el mapa (sin temblores).
    if (r != null && (rumboAhora == null || Math.abs(difAngulo(rumboAhora, r)) >= 5)) setRumboAhora(r);
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps
  const velocidadKmh = gps.current.velocidad != null && gps.current.velocidad >= 0 ? gps.current.velocidad * 3.6 : null;
  const zoom = zoomNavegacion({ velocidadKmh, giroM: nav?.giro?.distanciaM ?? null });

  // Seguimiento automático hasta que el conductor mueva el mapa (como mucho cada segundo): el coche abajo, la carretera
  // por delante hacia arriba, inclinado, y de cerca al llegar a un cruce, rotonda o cambio de sentido.
  useEffect(() => {
    if (!seguir || !pos) return;
    const ahora = Date.now();
    if (ahora - ultimoEase.current < 1000) return;
    ultimoEase.current = ahora;
    camara.current?.easeTo({ center: lngLat(pos), bearing: rumboAhora ?? 0, zoom, pitch: rumboAhora == null ? 0 : 45,
      padding: { top: 150, right: 0, bottom: 0, left: 0 }, duration: 900 });
  }, [seguir, pos, rumboAhora, zoom]);
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

  // El mismo mapa en la tarjeta o a pantalla completa (al tocarlo): se monta en un sitio u otro y vuelve a seguir al coche.
  const abrirCompleta = () => { ultimoEase.current = 0; setCompleta(true); };
  const cerrarCompleta = () => { ultimoEase.current = 0; setCompleta(false); };
  const zoomManual = (d: number) => { setSeguir(false); camara.current?.zoomTo(Math.max(3, Math.min(19, zoomMapa + d)), { duration: 250 }); };
  const mapa = (
    <MapaLibre style={StyleSheet.absoluteFill} mapStyle={ESTILO} attribution logo={false}
      onPress={completa ? undefined : abrirCompleta}
      onRegionWillChange={(e) => { if (e.nativeEvent.userInteraction) setSeguir(false); }}
      onRegionDidChange={(e) => { setGiroMapa(e.nativeEvent.bearing ?? 0); setZoomMapa(e.nativeEvent.zoom ?? zoomMapa); }}>
      <Camera ref={camara} initialViewState={{ center: lngLat(pos ?? objetivo.punto), zoom: 14 }} />
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
          {rumboAhora == null
            ? <View style={estilos.yo} accessibilityLabel="Tu posición" />
            : (
              // Flecha en el sentido de la marcha (apunta arriba mientras el mapa sigue al coche).
              <View style={[estilos.flecha, { transform: [{ rotate: `${difAngulo(giroMapa, rumboAhora)}deg` }] }]} accessibilityLabel="Tu posición y sentido de la marcha">
                <View style={estilos.flechaPunta} />
              </View>
            )}
        </Marker>
      ) : null}
    </MapaLibre>
  );
  const capas = (
    <>
      <View style={estilos.banner} pointerEvents="none">
        <Text style={estilos.bannerTexto}>{textoBannerRuta(objetivo.tipo, quedaM, quedaS)}</Text>
        {ruta?.fuente === "recta" && <Text style={estilos.bannerAviso}>Ruta aproximada (sin servicio de rutas)</Text>}
      </View>
      {pos && !seguir && (
        <Pressable onPress={() => setSeguir(true)} accessibilityRole="button" accessibilityLabel="Centrar en mi posición" style={estilos.centrar}>
          <Text style={estilos.centrarTexto}>Centrar</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={estilos.caja}>
      {fase !== "lejos" && (
        <View accessibilityRole="alert" style={[estilos.alerta, { backgroundColor: fase === "llegado" ? VERDE : "#fbbf24" }]}>
          <Text style={estilos.alertaTexto}>{textoAvisoProximidad(fase, objetivo.tipo, distObj)}</Text>
        </View>
      )}
      <View style={estilos.mapa}>
        {completa
          ? <View style={estilos.enCompleta}><Text style={estilos.enCompletaTexto}>Mapa a pantalla completa</Text></View>
          : <>{mapa}{capas}<View style={estilos.ampliar} pointerEvents="none"><Text style={estilos.ampliarTexto}>⤢ Toca para ampliar</Text></View></>}
      </View>
      {avisoGps && <Text accessibilityRole="text" style={estilos.avisoGps}>{avisoGps}</Text>}
      <Modal visible={completa} animationType="fade" presentationStyle="fullScreen" onRequestClose={cerrarCompleta} supportedOrientations={["portrait"]}>
        {/* Un Modal es otra ventana nativa: necesita su propio proveedor de zona segura. */}
        <SafeAreaProvider>
          <SafeAreaView style={estilos.completa} edges={["top", "bottom"]}>
            <View style={{ flex: 1 }}>
              {mapa}
              {capas}
              <View style={estilos.zoom}>
                <Pressable onPress={() => zoomManual(1)} accessibilityRole="button" accessibilityLabel="Acercar" style={estilos.zoomBoton}><Text style={estilos.zoomTexto}>+</Text></Pressable>
                <Pressable onPress={() => zoomManual(-1)} accessibilityRole="button" accessibilityLabel="Alejar" style={estilos.zoomBoton}><Text style={estilos.zoomTexto}>−</Text></Pressable>
              </View>
            </View>
            <Pressable onPress={cerrarCompleta} accessibilityRole="button" accessibilityLabel="Salir del mapa a pantalla completa" style={estilos.salir}>
              <Text style={estilos.salirTexto}>✕  Salir del mapa</Text>
            </Pressable>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
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
  flecha: { width: 34, height: 34, borderRadius: 17, backgroundColor: AZUL, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  // Triángulo alargado (sin SVG en la app): la punta se distingue de la base de un vistazo.
  flechaPunta: { width: 0, height: 0, marginTop: -4, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 18, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#fff" },
  ampliar: { position: "absolute", right: 10, top: 52, backgroundColor: "rgba(2,6,23,0.75)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  ampliarTexto: { color: "#e2e8f0", fontSize: 13, fontWeight: "700" },
  enCompleta: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.tarjeta },
  enCompletaTexto: { color: color.textoTenue, fontSize: 15 },
  completa: { flex: 1, backgroundColor: "#020617" },
  zoom: { position: "absolute", right: 12, top: "40%", gap: 10 },
  zoomBoton: { width: 56, height: 56, borderRadius: 14, backgroundColor: "rgba(2,6,23,0.88)", borderWidth: 1, borderColor: color.borde, alignItems: "center", justifyContent: "center" },
  zoomTexto: { color: "#fff", fontSize: 30, fontWeight: "700", marginTop: -2 },
  salir: { minHeight: 60, margin: 12, borderRadius: 16, backgroundColor: "#1e293b", borderWidth: 1, borderColor: color.borde, alignItems: "center", justifyContent: "center" },
  salirTexto: { color: "#fff", fontSize: 19, fontWeight: "800" },
  avisoGps: { backgroundColor: "#dc2626", color: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: "600" },
});
