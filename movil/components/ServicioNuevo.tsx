import { MOTIVOS_RECHAZO } from "@dominio/estados";
import { claveAsignacion as clave, formatoCuenta, segundosRestantes } from "@dominio/plazo";
import type { Servicio } from "@dominio/tipos";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Boton } from "./ui";
import { enviarAccion, nuevoIdAccion } from "~/lib/acciones";
import { fechaHora, fmt } from "~/lib/formato";
import { exigir } from "~/lib/servicios";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

type Nuevo = Pick<Servicio, "id" | "estado" | "conductor_id" | "asignado_en" | "plazo_respuesta_min" | "fecha_hora_recogida" |
  "origen_texto" | "destino_texto" | "pasajeros" | "maletas" | "numero_vuelo" | "notas">;
const CAMPOS = "id,estado,conductor_id,asignado_en,plazo_respuesta_min,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas,numero_vuelo,notas";
const VUELTA = "El servicio ha vuelto a la central";

/** Modal a pantalla completa cuando la central me asigna un servicio (el más antiguo primero). */
export function ServicioNuevo({ yo }: { yo: string }) {
  const { datos, recargar } = useConsulta(async () =>
    exigir(await supabase.from("servicios").select(CAMPOS).eq("conductor_id", yo).eq("estado", "asignado")) as Nuevo[], [yo]);
  const [ahora, setAhora] = useState(() => new Date());
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const idAccion = useRef<string | null>(null);
  const mostrado = useRef<string | null>(null);
  const ocultar = (k: string) => setOcultos((o) => new Set(o).add(k));

  const s = (datos ?? [])
    .filter((x) => x.conductor_id === yo && x.estado === "asignado" && x.asignado_en && !ocultos.has(clave(x)))
    .sort((a, b) => (a.asignado_en! < b.asignado_en! ? -1 : 1))[0];
  const restante = s ? segundosRestantes(s.asignado_en!, s.plazo_respuesta_min, ahora) : 0;
  const abierta = !!s;

  useEffect(() => {
    if (!abierta) return;
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 1000);
    // Reconciliación periódica con la BD (por si se perdió un evento en vivo).
    const r = setInterval(() => void recargar(), 20_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [abierta, recargar]);
  // Plazo agotado: cerrar con aviso.
  // Aparece uno nuevo: vibrar; si desaparece sin que yo actúe (reasignado/expirado): aviso.
  useEffect(() => {
    const id = s ? clave(s) : null;
    if (id === mostrado.current) return;
    if (id) {
      setRechazando(false); setOtro(false); setTexto(""); setError(null); setAviso(null); idAccion.current = null;
      Vibration.vibrate([0, 300, 150, 300]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else if (mostrado.current && !ocultos.has(mostrado.current)) setAviso(VUELTA);
    mostrado.current = id;
  }, [s, ocultos]);

  async function enviar(accion: "aceptar" | "rechazar", motivo?: string) {
    if (!s || enviando) return;
    setEnviando(true); setError(null);
    idAccion.current ??= nuevoIdAccion(); // mismo id en reintentos: el servidor lo trata como idempotente
    try {
      const r = await enviarAccion({ idAccion: idAccion.current, servicioId: s.id, accion, motivo });
      if (r.ok) { ocultar(clave(s)); idAccion.current = null; void recargar(); }
      else { setError(r.error); idAccion.current = null; void recargar(); }
    } catch { setError("No se pudo enviar. Revisa la conexión y reinténtalo."); void recargar(); }
    finally { setEnviando(false); }
  }

  if (!s) {
    return aviso ? (
      <SafeAreaView edges={["top"]} style={estilos.banner} accessibilityRole="alert">
        <View style={estilos.bannerFila}>
          <Text style={estilos.bannerTexto}>{aviso}</Text>
          <Boton texto="Entendido" alto={44} tamano={16} variante="secundario" onPress={() => setAviso(null)} />
        </View>
      </SafeAreaView>
    ) : null;
  }
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => ocultar(clave(s))}>
      <SafeAreaView style={estilos.pantalla}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
            <Text style={estilos.etiqueta} accessibilityRole="header">SERVICIO NUEVO</Text>
            <Text style={[estilos.cuenta, restante > 86400 && { fontSize: 28 }]}>{formatoCuenta(restante)}</Text>
            {restante > 0 && restante <= 86400 && <Text style={estilos.tenue}>para responder</Text>}
            {restante === 0 && <Text style={[estilos.tenue, { color: "#fcd34d", fontWeight: "600", textAlign: "center" }]}>Plazo vencido · la central está avisada. Puedes aceptarlo igualmente si sigue siendo tuyo.</Text>}
            <Text style={estilos.fecha}>{fmt(fechaHora, s.fecha_hora_recogida)}</Text>
            <Text style={estilos.ruta}>{s.origen_texto} → {s.destino_texto}</Text>
            <Text style={estilos.meta}>{s.pasajeros} pax · {s.maletas} maletas{s.numero_vuelo ? ` · Vuelo ${s.numero_vuelo}` : ""}</Text>
            {s.notas && <Text style={estilos.notas}>{s.notas}</Text>}
            {error && <Text style={estilos.error} accessibilityRole="alert">{error}</Text>}
            <View style={estilos.acciones}>
              {!rechazando ? (
                <>
                  <Boton texto="ACEPTAR" variante="exito" alto={80} tamano={26} cargando={enviando} onPress={() => void enviar("aceptar")} />
                  <Boton texto="Rechazar" variante="peligro" deshabilitado={enviando} onPress={() => setRechazando(true)} />
                  <Boton texto="Ver más tarde" variante="texto" alto={48} tamano={16} onPress={() => ocultar(clave(s))} />
                </>
              ) : (
                <>
                  <Text style={estilos.subtitulo}>Motivo del rechazo</Text>
                  {MOTIVOS_RECHAZO.map((m) => (
                    <Boton key={m} texto={m} variante="secundario" deshabilitado={enviando}
                      estilo={m === "Otro" && otro ? { borderColor: color.marcaClaro } : undefined}
                      onPress={() => (m === "Otro" ? setOtro(true) : void enviar("rechazar", m))} />
                  ))}
                  {otro && (
                    <>
                      <TextInput value={texto} onChangeText={setTexto} multiline placeholder="Explica el motivo" accessibilityLabel="Motivo"
                        placeholderTextColor={color.textoTenue} style={estilos.campo} maxLength={300} />
                      <Boton texto="Enviar rechazo" variante="peligro" cargando={enviando} deshabilitado={texto.trim() === ""}
                        onPress={() => void enviar("rechazar", texto.trim())} />
                    </>
                  )}
                  <Boton texto="Volver" variante="texto" alto={48} tamano={16} deshabilitado={enviando} onPress={() => { setRechazando(false); setOtro(false); }} />
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#020617" },
  contenido: { padding: 20, gap: 6, flexGrow: 1 },
  etiqueta: { color: color.marcaClaro, fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  cuenta: { color: color.marcaClaro, fontSize: 56, fontWeight: "800", fontVariant: ["tabular-nums"] },
  tenue: { color: color.textoTenue, fontSize: 14 },
  fecha: { color: color.texto, fontSize: 30, fontWeight: "800", marginTop: 16 },
  ruta: { color: color.texto, fontSize: 21, marginTop: 4 },
  meta: { color: color.textoSuave, fontSize: 17 },
  notas: { color: color.textoSuave, fontSize: 15, backgroundColor: color.tarjeta, borderRadius: 10, padding: 12, marginTop: 6 },
  error: { color: "#fca5a5", backgroundColor: "#450a0a", borderRadius: 10, padding: 12, marginTop: 8, fontSize: 15 },
  acciones: { marginTop: "auto", paddingTop: 24, gap: 12 },
  subtitulo: { color: color.texto, fontSize: 18, fontWeight: "700" },
  campo: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta, color: color.texto, borderRadius: 12, padding: 12, fontSize: 16, minHeight: 90, textAlignVertical: "top" },
  banner: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: color.marca, zIndex: 10 },
  bannerFila: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  bannerTexto: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700" },
});
