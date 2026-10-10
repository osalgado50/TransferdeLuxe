import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { color } from "~/lib/tema";

type Variante = "primario" | "secundario" | "peligro" | "exito" | "texto";
const FONDO: Record<Variante, string> = { primario: color.marca, secundario: "transparent", peligro: "transparent", exito: "#22c55e", texto: "transparent" };
const TINTA: Record<Variante, string> = { primario: "#fff", secundario: color.texto, peligro: "#f87171", exito: "#052e16", texto: color.textoTenue };
const BORDE: Record<Variante, string> = { primario: color.marca, secundario: color.borde, peligro: "#ef4444", exito: "#22c55e", texto: "transparent" };

/** Botón grande (≥ 56 px) pensado para usarse con una mano y a pleno sol. */
export function Boton({ texto, onPress, variante = "primario", deshabilitado, cargando, alto = 56, tamano = 18, estilo, etiqueta }: {
  texto: string; onPress: () => void; variante?: Variante; deshabilitado?: boolean; cargando?: boolean; alto?: number; tamano?: number;
  estilo?: StyleProp<ViewStyle>; etiqueta?: string;
}) {
  const off = deshabilitado || cargando;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={etiqueta ?? texto}
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [estilos.boton, { minHeight: alto, backgroundColor: FONDO[variante], borderColor: BORDE[variante] },
        variante !== "texto" && { borderWidth: variante === "primario" || variante === "exito" ? 0 : 1.5 },
        pressed && { opacity: 0.75 }, off && { opacity: 0.5 }, estilo]}>
      {cargando ? <ActivityIndicator color={TINTA[variante]} />
        : <Text style={[estilos.texto, { color: TINTA[variante], fontSize: tamano }, variante === "texto" && { textDecorationLine: "underline" }]}>{texto}</Text>}
    </Pressable>
  );
}

export function Tarjeta({ children, destacada, apagada }: { children: ReactNode; destacada?: boolean; apagada?: boolean }) {
  return <View style={[estilos.tarjeta, destacada && { borderColor: color.marcaClaro, borderWidth: 2 }, apagada && { opacity: 0.6 }]}>{children}</View>;
}

export function Aviso({ texto, tipo = "info" }: { texto: string; tipo?: "info" | "error" | "pendiente" }) {
  const c = tipo === "error" ? "#fca5a5" : tipo === "pendiente" ? "#fcd34d" : color.textoSuave;
  return <Text accessibilityRole={tipo === "error" ? "alert" : undefined} style={[estilos.aviso, { color: c }]}>{texto}</Text>;
}

const estilos = StyleSheet.create({
  boton: { borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  texto: { fontWeight: "700", textAlign: "center" },
  tarjeta: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta, borderRadius: 16, padding: 16, gap: 6 },
  aviso: { fontSize: 15 },
});
