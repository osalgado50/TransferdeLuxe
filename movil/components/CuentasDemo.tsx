import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color } from "~/lib/tema";

function Boton({ texto, etiqueta, onPress, icono }: { texto: string; etiqueta: string; onPress: () => void; icono?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta}
      style={({ pressed }) => [estilos.boton, pressed && { borderColor: color.marcaClaro }]}>
      {icono && <Ionicons name="copy-outline" size={16} color={color.textoSuave} />}
      <Text style={estilos.botonTexto}>{texto}</Text>
    </Pressable>
  );
}

// Recuadro «Cuentas de demo» como en la web: Copiar / Usar por cuenta, y la contraseña pública de demo.
export function CuentasDemo({ cuentas, clave, onUsar }: { cuentas: string[]; clave?: string; onUsar: (email: string) => void }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function copiar(v: string) {
    await Clipboard.setStringAsync(v);
    setCopiado(v);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(null), 1800);
  }
  return (
    <View style={estilos.caja}>
      <Text style={estilos.titulo}>Cuentas de demo</Text>
      {cuentas.map((c) => (
        <View key={c} style={estilos.fila}>
          <Text style={estilos.mono} selectable>{c}</Text>
          <View style={estilos.botones}>
            <Boton icono texto={copiado === c ? "Copiado ✓" : "Copiar"} etiqueta={`Copiar ${c}`} onPress={() => copiar(c)} />
            <Boton texto="Usar" etiqueta={`Usar ${c}`} onPress={() => onUsar(c)} />
          </View>
        </View>
      ))}
      {clave && (
        <View style={estilos.fila}>
          <Text style={estilos.texto}>Contraseña: <Text style={[estilos.mono, { color: color.marcaClaro }]}>{clave}</Text></Text>
          <Boton icono texto={copiado === clave ? "Copiado ✓" : "Copiar"} etiqueta="Copiar contraseña" onPress={() => copiar(clave)} />
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: { borderWidth: 1, borderColor: color.borde, borderRadius: 16, padding: 16, gap: 8 },
  titulo: { color: color.texto, fontSize: 18, fontWeight: "600", marginBottom: 4 },
  fila: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8,
    backgroundColor: "rgba(15,23,42,0.7)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  botones: { flexDirection: "row", gap: 8 },
  boton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#475569",
    borderRadius: 8, paddingHorizontal: 12 },
  botonTexto: { color: color.textoSuave, fontSize: 14 },
  mono: { color: color.texto, fontFamily: "monospace", fontSize: 15, flexShrink: 1 },
  texto: { color: color.textoSuave, fontSize: 15, flexShrink: 1 },
});
