import { miniaturaRecorrido, type PuntoLngLat } from "@dominio/recorrido";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color } from "~/lib/tema";

type XY = [number, number];
const GROSOR = 3;

/** Segmentos como Views giradas: dibujo del recorrido sin mapa ni dependencias nativas nuevas. */
function Tramo({ xy, c }: { xy: XY[]; c: string }) {
  return xy.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = xy[i];
    const largo = Math.hypot(x2 - x1, y2 - y1);
    if (largo < 0.5) return null;
    return (
      <View key={i} style={{
        position: "absolute", left: (x1 + x2) / 2 - largo / 2, top: (y1 + y2) / 2 - GROSOR / 2, width: largo + GROSOR / 2, height: GROSOR,
        borderRadius: GROSOR / 2, backgroundColor: c, transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
      }} />
    );
  });
}
const Punto = ({ p, c }: { p: XY; c: string }) => (
  <View style={[estilos.punto, { left: p[0] - 4, top: p[1] - 4, backgroundColor: c }]} />
);

/** Miniatura del recorrido: azul hacia la recogida, rojo con pasajeros; puntos de inicio, recogida y fin. */
export function MiniRecorrido({ puntos, corte, ancho = 96, alto = 72 }: { puntos: PuntoLngLat[] | null | undefined; corte: number | null | undefined; ancho?: number; alto?: number }) {
  const m = useMemo(() => miniaturaRecorrido(puntos ?? [], corte ?? null, ancho, alto, 8), [puntos, corte, ancho, alto]);
  return (
    <View style={[estilos.caja, { width: ancho, height: alto }]} accessibilityLabel={m ? "Dibujo de la ruta" : "Sin GPS"}>
      {m ? <>
        <Tramo xy={m.hacia} c="#60a5fa" />
        <Tramo xy={m.con} c="#f87171" />
        <Punto p={m.inicio} c="#e2e8f0" />
        {m.recogida && <Punto p={m.recogida} c="#22c55e" />}
        <Punto p={m.fin} c="#ef4444" />
      </> : <Text style={estilos.sin}>Sin GPS</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { borderRadius: 8, borderWidth: 1, borderColor: color.borde, backgroundColor: "#1e293b", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  punto: { position: "absolute", width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: "#fff" },
  sin: { color: color.textoTenue, fontSize: 12 },
});
