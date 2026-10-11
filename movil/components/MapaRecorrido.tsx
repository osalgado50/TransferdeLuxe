import { COLOR_CON, COLOR_HACIA, tramosRecorrido, type PuntoLngLat } from "@dominio/recorrido";
import { Camera, GeoJSONSource, Layer, Map as MapaLibre, Marker, type StyleSpecification } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { color } from "~/lib/tema";

// Mismo estilo raster de OpenStreetMap que MapaServicio (sin claves ni proveedor de pago).
const ESTILO: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const linea = (coords: PuntoLngLat[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } });

/** Mapa grande del recorrido real: azul hacia la recogida, rojo con pasajeros; inicio, recogida y fin. */
export function MapaRecorrido({ puntos, corte, alto = 380 }: { puntos: PuntoLngLat[]; corte: number | null; alto?: number }) {
  const { hacia, con } = useMemo(() => tramosRecorrido(puntos, corte), [puntos, corte]);
  const limites = useMemo((): [number, number, number, number] => {
    const lngs = puntos.map((p) => p[0]), lats = puntos.map((p) => p[1]);
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  }, [puntos]);
  const ini = puntos[0], fin = puntos[puntos.length - 1], rec = corte != null && hacia.length ? hacia[hacia.length - 1] : null;
  return (
    <View style={[estilos.mapa, { height: alto }]}>
      <MapaLibre style={StyleSheet.absoluteFill} mapStyle={ESTILO} attribution logo={false}>
        <Camera initialViewState={{ bounds: limites, padding: { top: 40, right: 40, bottom: 40, left: 40 } }} />
        {hacia.length > 1 && (
          <GeoJSONSource id="rec-hacia" data={linea(hacia)}>
            <Layer id="rec-hacia-linea" type="line" style={{ lineColor: COLOR_HACIA, lineWidth: 5, lineCap: "round", lineJoin: "round" }} />
          </GeoJSONSource>
        )}
        {con.length > 1 && (
          <GeoJSONSource id="rec-con" data={linea(con)}>
            <Layer id="rec-con-linea" type="line" style={{ lineColor: COLOR_CON, lineWidth: 5, lineCap: "round", lineJoin: "round" }} />
          </GeoJSONSource>
        )}
        <Marker id="rec-inicio" lngLat={ini} anchor="center"><View style={[estilos.punto, { backgroundColor: "#fff", borderColor: "#334155" }]} accessibilityLabel="Inicio" /></Marker>
        {rec ? <Marker id="rec-recogida" lngLat={rec} anchor="center"><View style={[estilos.punto, { backgroundColor: "#16a34a" }]} accessibilityLabel="Recogida" /></Marker> : null}
        <Marker id="rec-fin" lngLat={fin} anchor="center"><View style={[estilos.punto, { backgroundColor: "#dc2626" }]} accessibilityLabel="Destino" /></Marker>
      </MapaLibre>
    </View>
  );
}

const estilos = StyleSheet.create({
  mapa: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: color.borde },
  punto: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: "#fff" },
});
