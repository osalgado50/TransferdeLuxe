import { COLOR_INDICADOR, type IndicadorPuntualidad } from "@dominio/puntualidadCentral";
import { StyleSheet, Text, View } from "react-native";

/** Semáforo de llegada a la recogida (central): verde a tiempo, naranja justo, rojo retraso; «sin GPS» en gris. */
export function ChipPuntualidad({ ind }: { ind?: IndicadorPuntualidad | null }) {
  if (!ind) return null;
  const c = COLOR_INDICADOR[ind.estado];
  return (
    <View style={estilos.fila} accessibilityLabel={`Llegada: ${ind.texto}${ind.conGps ? "" : ", sin GPS reciente"}`}>
      <Text style={[estilos.chip, { backgroundColor: c.fondo, color: c.texto }]}>{ind.texto}</Text>
      {!ind.conGps && ind.estado !== "sin_gps" && <Text style={[estilos.chip, estilos.sinGps]}>sin GPS</Text>}
    </View>
  );
}
const estilos = StyleSheet.create({
  fila: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignSelf: "flex-start" },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 14, fontWeight: "700", overflow: "hidden" },
  sinGps: { backgroundColor: "#475569", color: "#e2e8f0", fontWeight: "600" },
});
