import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { color } from "~/lib/tema";

export default function Ticket() {
  return (
    <View style={estilos.pantalla}>
      <Ionicons name="receipt-outline" size={56} color={color.marcaClaro} />
      <Text style={estilos.titulo}>Ticket de combustible</Text>
      <Text style={estilos.texto}>Próximamente: foto del ticket con lectura automática.</Text>
    </View>
  );
}
const estilos = StyleSheet.create({
  pantalla: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  titulo: { color: color.texto, fontSize: 22, fontWeight: "700" },
  texto: { color: color.textoTenue, fontSize: 16, textAlign: "center" },
});
