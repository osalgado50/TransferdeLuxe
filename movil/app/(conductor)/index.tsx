import type { EstadoServicio } from "@dominio/tipos";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

// Pantalla provisional (Task N1): las pantallas del conductor llegan en N3.
const ESTADOS_ACTIVOS: EstadoServicio[] = ["asignado", "aceptado", "en_camino", "recogido"];

export default function Inicio() {
  const { perfil, salir } = useSesion();
  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.contenido}>
        <Text style={estilos.titulo}>Hola, {perfil?.nombre ?? "conductor"}</Text>
        <Text style={estilos.texto}>Sesión iniciada como conductor. Tus servicios ({ESTADOS_ACTIVOS.length} estados activos) aparecerán aquí.</Text>
        <Pressable onPress={salir} accessibilityRole="button" style={({ pressed }) => [estilos.boton, pressed && { borderColor: color.marcaClaro }]}>
          <Text style={estilos.botonTexto}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { flex: 1, padding: 16, gap: 16, justifyContent: "center" },
  titulo: { color: color.marcaClaro, fontSize: 24, fontWeight: "600" },
  texto: { color: color.textoSuave, fontSize: 16 },
  boton: { minHeight: 48, borderWidth: 1, borderColor: color.borde, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  botonTexto: { color: color.texto, fontSize: 16 },
});
