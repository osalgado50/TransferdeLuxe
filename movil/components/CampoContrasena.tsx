import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import type { Ref } from "react";
import { color } from "~/lib/tema";

// Campo de contraseña con botón (ojo) para mostrarla y comprobar que se ha escrito bien.
export function CampoContrasena({ style, ref, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={estilos.fila}>
      <TextInput {...props} ref={ref} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false}
        style={[style, estilos.input]} />
      <Pressable onPress={() => setVisible((v) => !v)} style={estilos.ojo} hitSlop={8}
        accessibilityRole="button" accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        accessibilityState={{ selected: visible }}>
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={color.textoTenue} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { position: "relative", justifyContent: "center" },
  input: { paddingRight: 48 },
  ojo: { position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" },
});
