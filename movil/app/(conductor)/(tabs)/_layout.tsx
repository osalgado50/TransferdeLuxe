import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InterruptorGps } from "~/components/InterruptorGps";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

function Cabecera() {
  const { perfil, sesion, salir, sinConexion, reintentar } = useSesion();
  const { top } = useSafeAreaInsets();
  return (
    <View style={[estilos.cabecera, { paddingTop: top + 8 }]}>
      <View style={estilos.filaCabecera}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.nombre} numberOfLines={1}>{perfil?.nombre ?? "Conductor"}</Text>
        {sinConexion && <Pressable onPress={reintentar} accessibilityRole="button"><Text style={estilos.sinRed}>Sin conexión · tocar para reintentar</Text></Pressable>}
      </View>
      <Pressable onPress={() => Linking.openURL("https://app.transfersvipluxe.com/privacidad")} accessibilityRole="link"
        accessibilityLabel="Política de privacidad" hitSlop={8} style={estilos.salir}>
        <Text style={estilos.salirTexto}>Privacidad</Text>
      </Pressable>
      <Pressable onPress={salir} accessibilityRole="button" accessibilityLabel="Cerrar sesión" hitSlop={8}
        style={({ pressed }) => [estilos.salir, pressed && { borderColor: color.marcaClaro }]}>
        <Text style={estilos.salirTexto}>Salir</Text>
      </Pressable>
      </View>
      {sesion && <InterruptorGps key={sesion.user.id} conductorId={sesion.user.id} />}
    </View>
  );
}

const icono = (n: keyof typeof Ionicons.glyphMap) => ({ color: c, size }: { color: ColorValue; size: number }) => <Ionicons name={n} color={c as string} size={size + 2} />;

export default function LayoutPestanas() {
  const { perfil } = useSesion();
  // El operador (jefe) entra en el modo central; sus servicios están en la pestaña «Mis servicios».
  if (perfil?.rol === "operador") return <Redirect href="/central" />;
  return (
    <Tabs screenOptions={{
      header: () => <Cabecera />,
      tabBarActiveTintColor: color.marcaClaro, tabBarInactiveTintColor: color.textoTenue,
      tabBarStyle: { backgroundColor: color.tarjeta, borderTopColor: color.borde, height: 88, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 14, fontWeight: "600" },
      sceneStyle: { backgroundColor: color.fondo },
    }}>
      <Tabs.Screen name="index" options={{ title: "Hoy", tabBarIcon: icono("today-outline") }} />
      <Tabs.Screen name="historial" options={{ title: "Historial", tabBarIcon: icono("time-outline") }} />
      <Tabs.Screen name="ticket" options={{ title: "Ticket", tabBarIcon: icono("receipt-outline") }} />
    </Tabs>
  );
}

const estilos = StyleSheet.create({
  cabecera: { paddingHorizontal: 16, paddingBottom: 10, gap: 8,
    backgroundColor: color.fondo, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  filaCabecera: { flexDirection: "row", alignItems: "center", gap: 12 },
  nombre: { color: color.marcaClaro, fontSize: 20, fontWeight: "700" },
  sinRed: { color: "#fcd34d", fontSize: 14, marginTop: 2 },
  salir: { minHeight: 44, paddingHorizontal: 16, borderWidth: 1, borderColor: color.borde, borderRadius: 10, justifyContent: "center" },
  salirTexto: { color: color.texto, fontSize: 16, fontWeight: "600" },
});
