import { Alert, Linking, ScrollView, StyleSheet, Text } from "react-native";
import { Boton } from "~/components/ui";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

const WEB = "https://app.transfersvipluxe.com";
const abrir = (url: string) => Linking.openURL(url).catch(() => Alert.alert("No se pudo abrir", "Comprueba que tienes un navegador instalado."));

export default function Mas() {
  const { salir, perfil } = useSesion();
  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Text style={estilos.texto}>Para planificar, editar reservas, flota, informes y ajustes usa la central web.</Text>
      <Boton texto="Abrir la central web" onPress={() => abrir(`${WEB}/central`)} alto={64} />
      <Boton texto="Política de privacidad" variante="secundario" onPress={() => abrir(`${WEB}/privacidad`)} />
      <Text style={estilos.meta}>Sesión: {perfil?.nombre ?? "—"} · Central{perfil?.conduce ? " (también conduce)" : ""}</Text>
      <Boton texto="Cerrar sesión" variante="peligro" onPress={() =>
        Alert.alert("Cerrar sesión", "Dejarás de recibir avisos en este móvil.", [
          { text: "Cancelar", style: "cancel" }, { text: "Cerrar sesión", style: "destructive", onPress: () => void salir() },
        ])} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  texto: { color: color.textoSuave, fontSize: 17 },
  meta: { color: color.textoTenue, fontSize: 15, marginTop: 8 },
});
