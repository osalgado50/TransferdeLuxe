import type { EstadoServicio } from "@dominio/tipos";
import { StyleSheet, Text } from "react-native";
import { ESTADO } from "~/lib/formato";

export function EstadoBadge({ estado }: { estado: EstadoServicio }) {
  const e = ESTADO[estado];
  return <Text style={[estilos.badge, { color: e.color, borderColor: e.color }]}>{e.texto}</Text>;
}
const estilos = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 13, fontWeight: "600", overflow: "hidden" },
});
