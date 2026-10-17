import { MOTIVOS_RECHAZO } from "@dominio/estados";
import { claveAsignacion as clave, formatoCuenta, segundosRestantes, siguienteNuevo } from "@dominio/plazo";
import type { Servicio } from "@dominio/tipos";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { useEsperaMapaCompleto } from "~/lib/mapaCompleto";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BloqueDireccion } from "./BloqueDireccion";
import { Boton } from "./ui";
import { enviarAccion, nuevoIdAccion } from "~/lib/acciones";
import { fechaHora, fmt } from "~/lib/formato";
import { avisoInsistente, avisoLocal } from "~/lib/push";
import { caido } from "~/lib/red";
import { exigir } from "~/lib/servicios";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

type Nuevo = Pick<Servicio, "id" | "estado" | "conductor_id" | "asignado_en" | "plazo_respuesta_min" | "fecha_hora_recogida" |
  "origen_texto" | "destino_texto" | "pasajeros" | "maletas" | "numero_vuelo" | "notas" | "origen_lat" | "origen_lng" | "destino_lat" | "destino_lng">;
const CAMPOS = "id,estado,conductor_id,asignado_en,plazo_respuesta_min,fecha_hora_recogida,origen_texto,destino_texto,pasajeros,maletas,numero_vuelo,notas,origen_lat,origen_lng,destino_lat,destino_lng";
const VUELTA = "El servicio ha vuelto a la central";

/** Modal a pantalla completa cuando la central me asigna un servicio (el de recogida más próxima primero). */
export function ServicioNuevo({ yo }: { yo: string }) {
  const { datos, recargar } = useConsulta(async () =>
    exigir(await supabase.from("servicios").select(CAMPOS).eq("conductor_id", yo).eq("estado", "asignado").eq("es_prueba", false).or("notas.is.null,notas.not.like.PRUEBA AUTOMÁTICA*")) as Nuevo[], [yo]);
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

  // Lo más urgente delante (recogida más próxima); las asignaciones viejas sin responder no tapan la de ahora.
  const s = siguienteNuevo(datos ?? [], yo, ocultos, ahora);
  const restante = s ? segundosRestantes(s.asignado_en!, s.plazo_respuesta_min, ahora) : 0;
  const abierta = !!s;
  // Con el mapa a pantalla completa abierto, primero se cierra (iOS no presenta una ventana sobre otra).
  const esperaMapa = useEsperaMapaCompleto(abierta);

  useEffect(() => {
    if (!abierta) return;
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 1000);
    // Reconciliación periódica con la BD (por si se perdió un evento en vivo).
    const r = setInterval(() => { if (!caido("supabase")) void recargar(); }, 20_000); // caída: la sonda avisa al volver
    return () => { clearInterval(t); clearInterval(r); };
  }, [abierta, recargar]);
  // Con la app abierta, además del modal: notificación con sonido (que suene aunque no se mire la pantalla), repetida
  // cada 20 s (máx. 5) con vibración fuerte mientras siga sin responder. Se para al aceptar/rechazar/ver más tarde.
  const idAviso = s ? clave(s) : null;
  const servId = s?.id;
  const resumen = s ? `${fmt(fechaHora, s.fecha_hora_recogida)} · ${s.origen_texto} → ${s.destino_texto}` : "";
  const cuerpo = useRef(resumen);
  const ocupado = useRef(false);
  useEffect(() => { cuerpo.current = resumen; ocupado.current = rechazando || enviando; });
  useEffect(() => {
    if (!idAviso || !servId) return;
    return avisoInsistente({
      id: `servicio-nuevo-${servId}`, titulo: "Servicio nuevo · responde en la app", cuerpo: () => cuerpo.current,
      datos: { tipo: "servicio_nuevo", servicioId: servId }, sigue: () => !ocupado.current,
      alRepetir: () => {
        Vibration.vibrate([0, 600, 200, 600, 200, 600]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      },
    });
  }, [idAviso, servId]);
  // Plazo agotado: cerrar con aviso.
  // Aparece uno nuevo: vibrar; si desaparece sin que yo actúe (reasignado/expirado): aviso.
  useEffect(() => {
    const id = s ? clave(s) : null;
    if (id === mostrado.current) return;
    if (id) {
      setRechazando(false); setOtro(false); setTexto(""); setError(null); setAviso(null); idAccion.current = null;
      Vibration.vibrate([0, 300, 150, 300]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else if (mostrado.current && !ocultos.has(mostrado.current)) {
      // Me lo han quitado (reasignado o retirado por la central) sin que respondiera: que se entere también por sonido.
      setAviso(VUELTA);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      const servicioId = mostrado.current.split("|")[0];
      void avisoLocal(`servicio-retirado-${servicioId}`, VUELTA, "Ya no tienes que responder a ese servicio", { tipo: "servicio_retirado", servicioId });
    }
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

  if (s && esperaMapa) return null;
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
      {/* Un Modal es otra ventana nativa: necesita su propio proveedor de zona segura (si no, el texto pisa la isla dinámica). */}
      <SafeAreaProvider>
      <SafeAreaView style={estilos.pantalla} edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
            <Text style={estilos.etiqueta} accessibilityRole="header">SERVICIO NUEVO</Text>
            <Text style={[estilos.cuenta, restante > 86400 && { fontSize: 28 }]}>{formatoCuenta(restante)}</Text>
            {restante > 0 && restante <= 86400 && <Text style={estilos.tenue}>para responder</Text>}
            {restante === 0 && <Text style={[estilos.tenue, { color: "#fcd34d", fontWeight: "600", textAlign: "center" }]}>Plazo vencido · la central está avisada. Puedes aceptarlo igualmente si sigue siendo tuyo.</Text>}
            <Text style={estilos.fecha}>{fmt(fechaHora, s.fecha_hora_recogida)}</Text>
            <View style={estilos.direcciones}>
              <BloqueDireccion tipo="recogida" texto={s.origen_texto} lat={s.origen_lat} lng={s.origen_lng} />
              <BloqueDireccion tipo="destino" texto={s.destino_texto} lat={s.destino_lat} lng={s.destino_lng} />
            </View>
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
      </SafeAreaProvider>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: "#020617" },
  contenido: { padding: 20, gap: 6, flexGrow: 1 },
  etiqueta: { color: color.marcaClaro, fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  cuenta: { color: color.marcaClaro, fontSize: 56, fontWeight: "800", fontVariant: ["tabular-nums"] },
  tenue: { color: color.textoTenue, fontSize: 14 },
  fecha: { color: color.texto, fontSize: 30, fontWeight: "800", marginTop: 10 },
  direcciones: { gap: 10, marginTop: 10, marginBottom: 4 },
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
