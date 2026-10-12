// Comunicar una incidencia a la central (pantalla Jornada y ficha del servicio): tipo, parte de golpes en el dibujo del
// coche para accidente y golpe, descripción, foto opcional y última posición conocida. Se envía al momento; las graves
// (avería, accidente, golpe) llegan a la central con alarma.
import { alternarZona } from "@dominio/cierre";
import { TIPOS_INCIDENCIA, admiteZonas, esIncidenciaGrave, validarIncidencia } from "@dominio/incidencias";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { DiagramaDanos, useAnchoDiagrama } from "./DiagramaDanos";
import { Aviso, Boton } from "./ui";
import { llamarApi } from "~/lib/api";
import { color } from "~/lib/tema";

async function enviar(ruta: string, body: unknown): Promise<string | null> {
  try {
    const r = await llamarApi(ruta, { method: "POST", body });
    if (r.ok) return null;
    return ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo enviar.";
  } catch { return "Sin conexión. Inténtalo de nuevo."; }
}

/** Botón «⚠ Incidencia» (o «⚠ Comunicar incidencia», grande) con el formulario a pantalla completa. */
export function BotonIncidencia({ servicioId, grande = false, alEnviada }: { servicioId?: string; grande?: boolean; alEnviada?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("");
  const [desc, setDesc] = useState("");
  const [zonas, setZonas] = useState<string[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ancho, laterales } = useAnchoDiagrama(40);
  const conZonas = admiteZonas(tipo);
  const reiniciar = () => { setAbierto(false); setTipo(""); setDesc(""); setZonas([]); setFoto(null); setError(null); };
  const cerrar = () => { if (!ocupado) reiniciar(); };

  const hacerFoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setError("Sin permiso de cámara."); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!r.canceled && r.assets[0]) setFoto(r.assets[0].uri);
  };
  const mandar = async () => {
    const cuerpo = { tipo, descripcion: desc, servicio_id: servicioId ?? null, zonas: conZonas ? zonas : [] };
    // Misma validación que el servidor antes de subir la foto (descripción obligatoria, golpe sin nada marcado…).
    const v = validarIncidencia(cuerpo, "x");
    if (!v.ok) { setError(v.error); return; }
    setOcupado(true); setError(null);
    try {
      // La alarma nunca depende de la foto: si no se puede preparar o subir, la incidencia sale igualmente sin ella.
      let foto_path: string | null = null;
      let avisoFoto: string | null = null;
      if (foto) {
        let base64: string | undefined;
        try {
          const m = await ImageManipulator.manipulateAsync(foto, [{ resize: { width: 1600 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
          base64 = m.base64;
        } catch { avisoFoto = "No se pudo preparar la foto"; }
        if (base64) {
          try {
            // JSON con base64 (no multipart: el proxy del servidor estropea las subidas troceadas del iPhone).
            const r = await llamarApi("/api/conductor/incidencia/foto", { method: "POST", body: { foto_base64: base64 } });
            const j = (await r.json().catch(() => null)) as { fotoPath?: string; error?: string } | null;
            if (r.ok && j?.fotoPath) foto_path = j.fotoPath;
            else avisoFoto = j?.error ?? "No se pudo subir la foto";
          } catch { avisoFoto = "No se pudo subir la foto (sin conexión)"; }
        }
      }
      let lat: number | null = null, lng: number | null = null;
      if ((await Location.getForegroundPermissionsAsync()).granted) {
        const pos = await Location.getLastKnownPositionAsync().catch(() => null);
        if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; }
      }
      const er = await enviar("/api/conductor/incidencia", { ...cuerpo, foto_path, lat, lng });
      if (er) { setError(er); return; }
      const grave = esIncidenciaGrave(tipo);
      reiniciar();
      alEnviada?.();
      const sinFoto = avisoFoto ? `\n\n${avisoFoto}: la incidencia se ha enviado sin foto.` : "";
      Alert.alert(grave ? "Enviada con alarma" : "Incidencia enviada", (grave
        ? "La central ya la tiene y le ha sonado la alarma. Si hay heridos o peligro, llama al 112."
        : "La central ya la tiene.") + sinFoto);
    } catch { setError("Sin conexión. Inténtalo de nuevo."); }
    finally { setOcupado(false); }
  };

  return (
    <>
      <Boton texto={grande ? "⚠ Comunicar incidencia" : "⚠ Incidencia"} variante="peligro" alto={grande ? 64 : 56} tamano={grande ? 20 : 18}
        estilo={grande ? { borderWidth: 2 } : undefined} onPress={() => setAbierto(true)} />
      <Modal visible={abierto} animationType="slide" presentationStyle="fullScreen" onRequestClose={cerrar}>
        <SafeAreaProvider>
          <SafeAreaView style={e.pantalla} edges={["top", "bottom", "left", "right"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={e.cabecera}>
                <Text style={e.titulo} accessibilityRole="header">Comunicar incidencia</Text>
                <Boton texto="Cancelar" variante="secundario" alto={44} tamano={16} deshabilitado={ocupado} onPress={cerrar} />
              </View>
              <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
                <Text style={e.etiqueta}>¿Qué ha pasado?</Text>
                <View style={e.tipos}>
                  {TIPOS_INCIDENCIA.map((t) => {
                    const on = tipo === t.clave;
                    return (
                      <Pressable key={t.clave} onPress={() => { setTipo(t.clave); setError(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={({ pressed }) => [e.tipo, on && e.tipoOn, pressed && { opacity: 0.75 }]}>
                        <Text style={[e.tipoTexto, on && { color: "#fff" }]}>{t.boton}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!tipo && esIncidenciaGrave(tipo) && <Text style={e.grave}>🚨 Se avisa a la central con alarma.</Text>}
                {conZonas && (
                  <>
                    <Text style={e.etiqueta}>Parte de golpes: toca las zonas dañadas</Text>
                    <View style={{ alignItems: "center" }}>
                      <DiagramaDanos zonas={zonas} alAlternar={(id) => setZonas((z) => alternarZona(z, id))} ancho={ancho} laterales={laterales} />
                    </View>
                    <View style={e.fila}>
                      <Text style={[e.ayuda, { flex: 1 }]} accessibilityLiveRegion="polite">
                        {zonas.length ? `${zonas.length} zona${zonas.length > 1 ? "s" : ""} marcada${zonas.length > 1 ? "s" : ""}` : "Sin zonas marcadas"}
                      </Text>
                      {zonas.length > 0 && <Boton texto="Borrar" variante="texto" alto={44} tamano={15} onPress={() => setZonas([])} etiqueta="Borrar las zonas marcadas" />}
                    </View>
                  </>
                )}
                <TextInput value={desc} onChangeText={setDesc} multiline maxLength={1000} textAlignVertical="top"
                  placeholder={tipo === "accidente" || tipo === "otro" ? "Descripción (obligatoria)" : "Descripción"} placeholderTextColor={color.textoTenue}
                  accessibilityLabel="Descripción de la incidencia" style={e.entrada} />
                <Boton texto={foto ? "Repetir foto ✓" : "Hacer foto (opcional)"} variante="secundario" onPress={() => void hacerFoto()} />
                {error && <Aviso tipo="error" texto={error} />}
              </ScrollView>
              <View style={e.pie}>
                <Boton texto="Enviar a la central" estilo={[{ flex: 1 }, !!tipo && esIncidenciaGrave(tipo) && { backgroundColor: "#dc2626" }]}
                  onPress={() => void mandar()} cargando={ocupado} deshabilitado={!tipo} />
              </View>
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
  titulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "800", flexShrink: 1 },
  contenido: { padding: 16, gap: 12, paddingBottom: 24 },
  etiqueta: { color: color.texto, fontSize: 17, fontWeight: "700" },
  tipos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tipo: { minHeight: 52, borderRadius: 12, borderWidth: 2, borderColor: color.borde, paddingHorizontal: 14, justifyContent: "center" },
  tipoOn: { backgroundColor: "#dc2626", borderColor: "#ef4444" },
  tipoTexto: { color: color.texto, fontSize: 17, fontWeight: "700" },
  grave: { color: "#fecaca", backgroundColor: "#450a0a", borderRadius: 10, padding: 10, fontSize: 15, fontWeight: "700" },
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  ayuda: { color: color.textoSuave, fontSize: 16 },
  entrada: { borderWidth: 1.5, borderColor: color.borde, borderRadius: 12, color: color.texto, padding: 12, fontSize: 17, minHeight: 100, backgroundColor: "#020617" },
  pie: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: color.borde },
});
