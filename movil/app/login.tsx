import { Image } from "expo-image";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CampoContrasena } from "~/components/CampoContrasena";
import { CuentasDemo } from "~/components/CuentasDemo";
import { CUENTAS_DEMO, DEMO_PASSWORD, MODO_DEMO } from "~/lib/config";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

export default function Login() {
  const { entrar } = useSesion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const refClave = useRef<TextInput>(null);

  async function enviar() {
    if (!email.trim() || !clave) { setError("Escribe tu email y tu contraseña"); return; }
    setPendiente(true); setError(null);
    const e = await entrar(email, clave);
    setPendiente(false);
    if (e) setError(e);
  }
  function usar(c: string) {
    setEmail(c);
    if (DEMO_PASSWORD) setClave(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Image source={require("../assets/images/logo.png")} style={estilos.logo} contentFit="contain"
            accessibilityLabel="Transfers VIP Luxe" />
          <Text style={estilos.titulo} accessibilityRole="header">TVL Conductor</Text>
          <View style={estilos.tarjeta}>
            <Text style={estilos.etiqueta}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} style={estilos.campo} keyboardType="email-address"
              autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"
              returnKeyType="next" onSubmitEditing={() => refClave.current?.focus()} accessibilityLabel="Email"
              placeholderTextColor={color.textoTenue} />
            <Text style={[estilos.etiqueta, { marginTop: 12 }]}>Contraseña</Text>
            <CampoContrasena ref={refClave} value={clave} onChangeText={setClave} style={estilos.campo}
              autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={enviar}
              accessibilityLabel="Contraseña" />
            {error && <Text style={estilos.error} accessibilityRole="alert">{error}</Text>}
            <Pressable onPress={enviar} disabled={pendiente} accessibilityRole="button"
              style={({ pressed }) => [estilos.boton, (pressed || pendiente) && { backgroundColor: color.marcaOscuro }, pendiente && { opacity: 0.6 }]}>
              {pendiente ? <ActivityIndicator color="#fff" /> : <Text style={estilos.botonTexto}>Entrar</Text>}
            </Pressable>
          </View>
          <Pressable onPress={() => Linking.openURL(URL_PRIVACIDAD)} accessibilityRole="link" hitSlop={8}>
            <Text style={estilos.legal}>Política de privacidad</Text>
          </Pressable>
          {MODO_DEMO && <CuentasDemo cuentas={CUENTAS_DEMO} clave={DEMO_PASSWORD} onUsar={usar} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const URL_PRIVACIDAD = "https://app.transfersvipluxe.com/privacidad";

const estilos = StyleSheet.create({
  legal: { color: color.textoTenue, fontSize: 14, textAlign: "center", textDecorationLine: "underline" },
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 20, flexGrow: 1, justifyContent: "center" },
  logo: { width: 96, height: 106, alignSelf: "center" },
  titulo: { color: color.marcaClaro, fontSize: 24, fontWeight: "600", textAlign: "center" },
  tarjeta: { borderWidth: 1, borderColor: "#1e293b", backgroundColor: "rgba(15,23,42,0.6)", borderRadius: 16, padding: 20 },
  etiqueta: { color: color.textoSuave, fontSize: 14, marginBottom: 4 },
  campo: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta, color: color.texto, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { color: color.error, marginTop: 12, fontSize: 14 },
  boton: { marginTop: 16, backgroundColor: color.marca, borderRadius: 8, minHeight: 48, alignItems: "center", justifyContent: "center" },
  botonTexto: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
