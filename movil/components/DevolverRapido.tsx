// La ✕ de cada servicio de la lista y «Devolver todos a la central»: cuando se acumulan trabajos o la app se queda
// enganchada, el conductor se los quita de encima y la central los redistribuye. Asignados → rechazar; aceptados o de
// camino → devolver (con el cliente a bordo, no). Por la cola offline: funciona sin cobertura y nunca se duplica.
import { accionDevolver, MOTIVOS_DEVOLUCION } from "@dominio/estados";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Boton } from "./ui";
import { nuevoIdAccion } from "~/lib/acciones";
import { colaDe, drenar } from "~/lib/cola";
import { color } from "~/lib/tema";

type Devolvible = { id: string; estado: string };

const confirmar = (titulo: string, texto: string) => new Promise<boolean>((ok) => {
  Alert.alert(titulo, texto, [{ text: "No", style: "cancel", onPress: () => ok(false) }, { text: "Sí, devolver", style: "destructive", onPress: () => ok(true) }],
    { cancelable: true, onDismiss: () => ok(false) });
});

/** Encola la devolución (o el rechazo) de cada servicio y la intenta enviar ya. Devuelve cuántos se encolaron. */
async function encolar(conductorId: string, servicios: Devolvible[], motivo: string): Promise<number> {
  const c = await colaDe(conductorId);
  const pendientes = new Set(c.cola.pendientes().map((p) => p.servicioId));
  let n = 0;
  for (const s of servicios) {
    const accion = accionDevolver(s.estado);
    if (!accion || pendientes.has(s.id)) continue; // ya hay algo en camino para ese servicio
    c.rechazos.delete(s.id);
    c.cola.encolar({ idAccion: nuevoIdAccion(), servicioId: s.id, accion, motivo });
    n++;
  }
  void drenar(conductorId, true).catch(() => {}); // gesto del usuario: intenta ya (sin red, la cola reintenta)
  return n;
}

export function DevolverRapido({ conductorId, servicios, enBloque, etiqueta, alDevolver }: {
  conductorId: string; servicios: Devolvible[];
  /** true: botón «Devolver todos a la central (N)»; false: la ✕ de una tarjeta. */
  enBloque?: boolean; etiqueta?: string; alDevolver?: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const validos = servicios.filter((s) => accionDevolver(s.estado));
  if (validos.length === 0 || (enBloque && validos.length < 2)) return null;

  const devolver = async (motivo: string) => {
    const m = motivo.trim();
    if (!m || enviando) return;
    const titulo = enBloque ? `¿Devolver ${validos.length} servicios?` : "¿Devolver el servicio?";
    if (!(await confirmar(titulo, `Motivo: ${m}\n\nVuelve${enBloque ? "n" : ""} a la central para que los asigne a otro conductor.`))) return;
    setEnviando(true);
    try {
      await encolar(conductorId, validos, m);
      setAbierto(false); setOtro(false); setTexto("");
      alDevolver?.(validos.map((s) => s.id));
    } finally { setEnviando(false); }
  };

  return (
    <>
      {enBloque
        ? <Boton texto={`↩  Devolver todos a la central (${validos.length})`} variante="peligro" alto={56} tamano={17} onPress={() => setAbierto(true)} />
        : (
          <Pressable onPress={() => setAbierto(true)} accessibilityRole="button" accessibilityLabel={etiqueta ?? "Devolver este servicio a la central"} hitSlop={6}
            style={({ pressed }) => [e.equis, pressed && { backgroundColor: "rgba(239,68,68,0.25)" }]}>
            <Text style={e.equisTexto}>✕</Text>
          </Pressable>
        )}
      <Modal visible={abierto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAbierto(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={e.pantalla} edges={["top", "bottom", "left", "right"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={e.cabecera}>
                <Text style={e.titulo} accessibilityRole="header">{enBloque ? `Devolver ${validos.length} servicios` : "Devolver a la central"}</Text>
                <Boton texto="Cancelar" variante="secundario" alto={44} tamano={16} onPress={() => { setAbierto(false); setOtro(false); }} />
              </View>
              <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
                <Text style={e.ayuda}>Elige el motivo. {enBloque ? "Vuelven" : "Vuelve"} a la central para que los reparta entre otros conductores.</Text>
                {MOTIVOS_DEVOLUCION.map((m) => (
                  <Boton key={m} texto={m} variante="secundario" alto={58} tamano={18} deshabilitado={enviando}
                    estilo={m === "Otro" && otro ? { borderColor: color.marcaClaro } : undefined}
                    onPress={() => (m === "Otro" ? setOtro(true) : void devolver(m))} />
                ))}
                {otro && (
                  <>
                    <TextInput value={texto} onChangeText={setTexto} multiline maxLength={300} placeholder="Escribe el motivo" accessibilityLabel="Motivo"
                      placeholderTextColor={color.textoTenue} style={e.campo} />
                    <Boton texto="Devolver" variante="peligro" cargando={enviando} deshabilitado={!texto.trim()} onPress={() => void devolver(texto)} />
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
  equis: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  equisTexto: { color: "#fca5a5", fontSize: 22, fontWeight: "800" },
  pantalla: { flex: 1, backgroundColor: color.fondo },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borde },
  titulo: { color: "#fca5a5", fontSize: 20, fontWeight: "800", flexShrink: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 32 },
  ayuda: { color: color.textoSuave, fontSize: 16 },
  campo: { borderWidth: 1.5, borderColor: color.borde, borderRadius: 12, color: color.texto, padding: 12, fontSize: 17, minHeight: 90, backgroundColor: "#020617", textAlignVertical: "top" },
});
