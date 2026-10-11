// Recogida (rojo: cargas y quedas ocupado) y destino (verde: descargas y quedas libre) en recuadros separados,
// texto blanco grande y botón para abrir la navegación. Pensado para leerse de un vistazo conduciendo.
import { direccionCorta, urlNavegacion } from "@dominio/direccion";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

const TIPOS = {
  recogida: { titulo: "RECOGIDA · CARGA", fondo: "rgba(220, 38, 38, 0.22)", borde: "#ef4444", acento: "#fca5a5" },
  destino: { titulo: "DESTINO · DESCARGA", fondo: "rgba(22, 163, 74, 0.22)", borde: "#22c55e", acento: "#86efac" },
} as const;

export function BloqueDireccion({ tipo, texto, lat, lng, grande = true }: {
  tipo: keyof typeof TIPOS; texto: string; lat?: number | null; lng?: number | null; grande?: boolean;
}) {
  const t = TIPOS[tipo];
  const d = direccionCorta(texto);
  return (
    <View style={[estilos.caja, { backgroundColor: t.fondo, borderColor: t.borde }]}
      accessible accessibilityLabel={`${tipo === "recogida" ? "Recogida" : "Destino"}: ${d.principal}${d.localidad ? `, ${d.localidad}` : ""}`}>
      <View style={estilos.cabecera}>
        <Text style={[estilos.titulo, { color: t.acento }]}>{t.titulo}</Text>
        <Pressable onPress={() => void Linking.openURL(urlNavegacion(texto, lat, lng)).catch(() => undefined)}
          accessibilityRole="button" accessibilityLabel={`Navegar a la ${tipo}`} hitSlop={8}
          style={({ pressed }) => [estilos.navegar, { borderColor: t.borde }, pressed && { opacity: 0.7 }]}>
          <Text style={estilos.navegarTexto}>➤ Navegar</Text>
        </Pressable>
      </View>
      <Text style={[estilos.principal, !grande && { fontSize: 18 }]} numberOfLines={3}>{d.principal}</Text>
      {d.localidad && <Text style={[estilos.localidad, { color: t.acento }]}>{d.localidad}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 4 },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titulo: { fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  navegar: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.25)" },
  navegarTexto: { color: "#fff", fontSize: 15, fontWeight: "800" },
  principal: { color: "#fff", fontSize: 23, fontWeight: "800", lineHeight: 29 },
  localidad: { fontSize: 17, fontWeight: "700" },
});
