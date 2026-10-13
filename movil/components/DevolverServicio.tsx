// «No puedo hacer este servicio» (avería, retraso grave, emergencia…): devuelve el servicio a la central con motivo por
// la cola offline (idempotente, funciona sin cobertura). La central recibe una alerta para reasignarlo.
import { MOTIVOS_DEVOLUCION } from "@dominio/estados";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Boton } from "./ui";
import { nuevoIdAccion } from "~/lib/acciones";
import { colaDe, drenar } from "~/lib/cola";
import { color } from "~/lib/tema";

const confirmar = (motivo: string) => new Promise<boolean>((ok) => {
  Alert.alert("¿Devolver el servicio?", `Motivo: ${motivo}\n\nVuelve a la central para que asigne otro conductor.`,
    [{ text: "No", style: "cancel", onPress: () => ok(false) }, { text: "Sí, devolver", style: "destructive", onPress: () => ok(true) }],
    { cancelable: true, onDismiss: () => ok(false) });
});

export function DevolverServicio({ servicioId, conductorId, estado, alDevolver }: {
  servicioId: string; conductorId: string; estado: string; alDevolver: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (estado !== "aceptado" && estado !== "en_camino") return null;

  const devolver = async (motivo: string) => {
    const m = motivo.trim();
    if (!m || enviando || !(await confirmar(m))) return;
    setEnviando(true);
    try {
      const c = await colaDe(conductorId);
      c.rechazos.delete(servicioId);
      c.cola.encolar({ idAccion: nuevoIdAccion(), servicioId, accion: "devolver", motivo: m });
      setAbierto(false); setOtro(false); setTexto("");
      alDevolver();
      void drenar(conductorId, true).catch(() => {}); // gesto del usuario: intenta ya (si no hay red, la cola reintenta)
    } finally { setEnviando(false); }
  };

  return (
    <>
      <Boton texto="🙅  No puedo hacer este servicio" variante="peligro" alto={56} tamano={17} onPress={() => setAbierto(true)} />
      <Modal visible={abierto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAbierto(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={e.pantalla} edges={["top", "bottom", "left", "right"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={e.cabecera}>
                <Text style={e.titulo} accessibilityRole="header">No puedo hacer este servicio</Text>
                <Boton texto="Cancelar" variante="secundario" alto={44} tamano={16} onPress={() => { setAbierto(false); setOtro(false); }} />
              </View>
              <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
                <Text style={e.ayuda}>Elige el motivo. El servicio vuelve a la central para que asigne otro conductor.</Text>
                {MOTIVOS_DEVOLUCION.map((m) => (
                  <Boton key={m} texto={m} variante="secundario" alto={60} tamano={19} deshabilitado={enviando}
                    estilo={m === "Otro" && otro ? { borderColor: color.marcaClaro } : undefined}
                    onPress={() => (m === "Otro" ? setOtro(true) : void devolver(m))} />
                ))}
                {otro && (
                  <>
                    <TextInput value={texto} onChangeText={setTexto} multiline maxLength={300} placeholder="Escribe el motivo" accessibilityLabel="Motivo"
                      placeholderTextColor={color.textoTenue} style={e.campo} />
                    <Boton texto="Devolver el servicio" variante="peligro" cargando={enviando} deshabilitado={!texto.trim()} onPress={() => void devolver(texto)} />
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borde },
  titulo: { color: "#fca5a5", fontSize: 20, fontWeight: "800", flexShrink: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 32 },
  ayuda: { color: color.textoSuave, fontSize: 16 },
  campo: { borderWidth: 1.5, borderColor: color.borde, borderRadius: 12, color: color.texto, padding: 12, fontSize: 17, minHeight: 90, backgroundColor: "#020617", textAlignVertical: "top" },
});
