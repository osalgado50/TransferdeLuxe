import { COLOR_ESTADO_MAPA, TEXTO_ESTADO_MAPA, type EstadoVehiculoMapa, type MarcadorFlota } from "@dominio/mapa";
import { Camera, Map as MapaLibre, Marker, type CameraRef, type StyleSpecification } from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color } from "~/lib/tema";

// Mismo estilo raster de OpenStreetMap que el mapa del servicio (sin claves ni proveedor de pago).
const ESTILO: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const CENTRO_INICIAL: [number, number] = [1.1416, 41.0763]; // Tarragona (como la web)
const ESTADOS: EstadoVehiculoMapa[] = ["libre", "en_camino", "con_pasajeros", "sin_senal"];

/** Mapa de la flota en vivo: un círculo con la inicial por conductor, color por estado. Tocar → nombre y antigüedad. */
export function MapaFlota({ marcadores }: { marcadores: MarcadorFlota[] }) {
  const camara = useRef<CameraRef>(null);
  const encuadrado = useRef(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const sel = marcadores.find((m) => m.conductorId === elegido);

  const encuadrar = () => {
    if (!marcadores.length) return;
    const lng = marcadores.map((m) => m.lng), lat = marcadores.map((m) => m.lat);
    const d = 0.01;
    camara.current?.fitBounds([Math.min(...lng) - d, Math.min(...lat) - d, Math.max(...lng) + d, Math.max(...lat) + d],
      { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration: 500 });
  };
  useEffect(() => {
    if (encuadrado.current || !marcadores.length) return;
    encuadrado.current = true;
    const t = setTimeout(encuadrar, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadores.length]);

  return (
    <View style={estilos.caja}>
      <View style={estilos.mapa}>
        <MapaLibre style={StyleSheet.absoluteFill} mapStyle={ESTILO} attribution logo={false} onPress={() => setElegido(null)}>
          <Camera ref={camara} initialViewState={{ center: CENTRO_INICIAL, zoom: 10 }} />
          {marcadores.map((m) => (
            <Marker key={m.conductorId} id={`c-${m.conductorId}`} lngLat={[m.lng, m.lat]} anchor="center">
              <Pressable onPress={() => setElegido(m.conductorId)} hitSlop={10} accessibilityRole="button"
                accessibilityLabel={`${m.nombre}: ${m.texto}, hace ${m.minutos} minutos`}
                style={[estilos.punto, { backgroundColor: m.color }, elegido === m.conductorId && estilos.puntoSel]}>
                <Text style={estilos.inicial}>{m.nombre.charAt(0).toUpperCase()}</Text>
              </Pressable>
            </Marker>
          ))}
        </MapaLibre>
        {marcadores.length > 0 && (
          <Pressable onPress={encuadrar} accessibilityRole="button" accessibilityLabel="Ver toda la flota" style={estilos.encuadrar}>
            <Text style={estilos.encuadrarTexto}>Ver todos</Text>
          </Pressable>
        )}
        {sel && (
          <View style={estilos.ficha} accessibilityLiveRegion="polite">
            <Text style={estilos.fichaNombre}>{sel.nombre}</Text>
            <Text style={estilos.fichaMeta}>{sel.texto} · hace {sel.minutos} min</Text>
          </View>
        )}
      </View>
      <View style={estilos.leyenda} accessibilityLabel="Leyenda de colores">
        {ESTADOS.map((e) => (
          <View key={e} style={estilos.leyendaItem}>
            <View style={[estilos.leyendaPunto, { backgroundColor: COLOR_ESTADO_MAPA[e] }]} />
            <Text style={estilos.leyendaTexto}>{TEXTO_ESTADO_MAPA[e]}</Text>
          </View>
        ))}
      </View>
      {marcadores.length === 0 && <Text style={estilos.vacio}>Nadie ha enviado su posición todavía.</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { gap: 8 },
  mapa: { height: 340, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: color.borde },
  punto: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  puntoSel: { width: 42, height: 42, borderRadius: 21, borderWidth: 3 },
  inicial: { color: "#fff", fontWeight: "800", fontSize: 15 },
  encuadrar: { position: "absolute", right: 10, top: 10, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: color.marca, justifyContent: "center" },
  encuadrarTexto: { color: "#fff", fontWeight: "700", fontSize: 15 },
  ficha: { position: "absolute", left: 10, right: 10, bottom: 10, backgroundColor: color.tarjeta, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: color.borde },
  fichaNombre: { color: color.texto, fontSize: 18, fontWeight: "700" },
  fichaMeta: { color: color.textoSuave, fontSize: 15 },
  leyenda: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaPunto: { width: 14, height: 14, borderRadius: 7 },
  leyendaTexto: { color: color.textoSuave, fontSize: 14 },
  vacio: { color: color.textoTenue, fontSize: 15 },
});
