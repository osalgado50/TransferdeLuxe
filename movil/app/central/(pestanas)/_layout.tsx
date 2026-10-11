import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InterruptorGps } from "~/components/InterruptorGps";
import { useCentral } from "~/lib/central";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

function Cabecera({ conGps }: { conGps?: boolean }) {
  const { perfil, sesion, sinConexion, reintentar } = useSesion();
  const { error, recargar } = useCentral();
  const { top } = useSafeAreaInsets();
  return (
    <View style={[estilos.cabecera, { paddingTop: top + 8 }]}>
      <Text style={estilos.nombre} numberOfLines={1}>{perfil?.nombre ?? "Central"}</Text>
      {(sinConexion || error) && (
        <Pressable onPress={() => { void reintentar(); void recargar(); }} accessibilityRole="button" hitSlop={8}>
          <Text style={estilos.sinRed}>{sinConexion ? "Sin conexión" : `No se pudo actualizar: ${error}`} · tocar para reintentar</Text>
        </Pressable>
      )}
      {conGps && sesion && <InterruptorGps key={sesion.user.id} conductorId={sesion.user.id} />}
    </View>
  );
}

const icono = (n: keyof typeof Ionicons.glyphMap) => ({ color: c, size }: { color: ColorValue; size: number }) => <Ionicons name={n} color={c as string} size={size + 2} />;

export default function PestanasCentral() {
  const { perfil, sesion } = useSesion();
  const { datos } = useCentral();
  const conduce = perfil?.conduce === true;
  // Insignia: alertas sin ver + reservas sin conductor.
  const alertas = datos ? datos.alertas.length : 0;
  const yo = sesion?.user.id;
  return (
    <Tabs screenOptions={{
      header: () => <Cabecera />,
      tabBarActiveTintColor: color.marcaClaro, tabBarInactiveTintColor: color.textoTenue,
      tabBarStyle: { backgroundColor: color.tarjeta, borderTopColor: color.borde, height: 88, paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 14, fontWeight: "600" },
      sceneStyle: { backgroundColor: color.fondo },
    }}>
      <Tabs.Screen name="index" options={{ title: "Central", tabBarIcon: icono("radio-outline"), tabBarBadge: alertas || undefined }} />
      <Tabs.Screen name="servicios" options={{ title: "Servicios", tabBarIcon: icono("list-outline"),
        tabBarBadge: datos?.pendientes.filter((s) => s.estado === "pendiente").length || undefined }} />
      <Tabs.Screen name="mis" options={{ title: "Mis servicios", tabBarIcon: icono("car-outline"), href: conduce && yo ? undefined : null,
        header: () => <Cabecera conGps /> }} />
      <Tabs.Screen name="mas" options={{ title: "Más", tabBarIcon: icono("ellipsis-horizontal") }} />
    </Tabs>
  );
}

const estilos = StyleSheet.create({
  cabecera: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, backgroundColor: color.fondo, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  nombre: { color: color.marcaClaro, fontSize: 20, fontWeight: "700" },
  sinRed: { color: "#fcd34d", fontSize: 14 },
});
