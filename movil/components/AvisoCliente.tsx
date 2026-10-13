// Aviso al cliente por WhatsApp «un toque» (wa.me, sin API) o SMS: botón verde grande y hoja con los avisos (en camino
// con la ETA del mapa, retraso con los minutos del contador de puntualidad, ya estoy aquí, cambio de conductor).
// Tras abrir el chat se anota el aviso en la Actividad en vivo de la central (idempotente por idAccion).
import {
  BOTON_AVISO, enlaceSms, enlaceWhatsApp, estimacionAviso, mensajeAviso, normalizarTelefono, type CanalAviso, type TipoAviso,
} from "@dominio/avisoCliente";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Boton } from "./ui";
import { nuevoIdAccion } from "~/lib/acciones";
import { llamarApi } from "~/lib/api";
import { API_URL } from "~/lib/config";
import { color } from "~/lib/tema";

interface Datos { ruta: string | null; conductor: string | null; modelo: string | null; matricula: string | null }
const MINUTOS = [5, 10, 15, 20, 30];

async function anotar(base: string, cuerpo: unknown) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await llamarApi(base, { method: "POST", body: cuerpo });
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 429)) return;
    } catch { /* sin red: un reintento */ }
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}

export function AvisoCliente({ servicioId, estado, recogida, telefono, cliente, tipos, modo = "conductor", etaS = null, abiertoInicial, etiqueta, conductorNombre }: {
  servicioId: string; estado: string; recogida: string; telefono: string | null; cliente: string | null; tipos: TipoAviso[];
  modo?: "conductor" | "central"; etaS?: number | null; abiertoInicial?: boolean; etiqueta?: string; conductorNombre?: string | null;
}) {
  const [abierto, setAbierto] = useState(!!abiertoInicial);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [retraso, setRetraso] = useState<number | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const pedido = useRef(false);
  const base = modo === "central" ? "/api/central/aviso-cliente" : "/api/conductor/aviso-cliente";

  useEffect(() => {
    if (!abierto || pedido.current) return;
    pedido.current = true;
    void (async () => {
      try {
        const r = await llamarApi(`${base}?servicioId=${encodeURIComponent(servicioId)}`);
        const j = (await r.json().catch(() => null)) as (Datos & { ok?: boolean }) | null;
        if (r.ok && j?.ok) setDatos(j); else pedido.current = false;
      } catch { pedido.current = false; } // sin red: el mensaje sale sin enlace
    })();
  }, [abierto, base, servicioId]);

  if (!tipos.length) return null;
  const tel = normalizarTelefono(telefono);
  const est = estimacionAviso({ estado, recogida, ahora: Date.now(), etaS });
  const enlace = datos?.ruta ? `${API_URL.replace(/\/+$/, "")}${datos.ruta}` : null;
  const minutos = retraso ?? est.minutos ?? 10;
  const texto = (tipo: TipoAviso) => {
    const hora = tipo === "retraso" && !est.minutos
      ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(Math.max(Date.now(), Date.parse(recogida)) + minutos * 60_000))
      : est.hora;
    return mensajeAviso(tipo, {
      cliente, conductor: datos?.conductor ?? conductorNombre ?? null, hora, minutos: tipo === "retraso" ? minutos : null, enlace,
      modelo: datos?.modelo, matricula: datos?.matricula, emisor: modo,
    });
  };
  const enviar = async (tipo: TipoAviso, canal: CanalAviso) => {
    const t = texto(tipo);
    const url = canal === "whatsapp" ? enlaceWhatsApp(telefono, t) : enlaceSms(telefono, t);
    if (!url) { Alert.alert("Sin teléfono válido", "El teléfono del cliente no es válido."); return; }
    try { await Linking.openURL(url); }
    catch {
      Alert.alert("No se pudo abrir", canal === "whatsapp" ? "¿Está WhatsApp instalado? Prueba por SMS." : "No se pudo abrir la app de mensajes.");
      return;
    }
    setAbierto(false);
    setHecho(canal === "whatsapp" ? "WhatsApp abierto: pulsa «enviar» en el chat." : "SMS abierto: pulsa «enviar».");
    void anotar(base, { idAccion: nuevoIdAccion(), servicioId, tipo, canal });
  };

  return (
    <>
      <Boton texto={etiqueta ?? "💬  Avisar al cliente"} variante="exito" alto={64} tamano={19} onPress={() => { setHecho(null); setAbierto(true); }} />
      {hecho && <Text style={e.hecho} accessibilityLiveRegion="polite">{hecho}</Text>}
      <Modal visible={abierto} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAbierto(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={e.pantalla} edges={["top", "bottom", "left", "right"]}>
            <View style={e.cabecera}>
              <Text style={e.titulo} accessibilityRole="header" numberOfLines={1}>Avisar al cliente{cliente ? ` · ${cliente}` : ""}</Text>
              <Boton texto="Cerrar" variante="secundario" alto={44} tamano={16} onPress={() => setAbierto(false)} />
            </View>
            <ScrollView contentContainerStyle={e.contenido}>
              {modo === "conductor" && <Text style={e.parado}>🛑 Envíalo parado: nunca con el coche en marcha.</Text>}
              {!tel && <Text style={e.error} accessibilityRole="alert">Sin teléfono válido del cliente: llama a la central.</Text>}
              {tipos.map((tipo) => (
                <View key={tipo} style={e.bloque}>
                  {tipo === "retraso" && (
                    <View style={e.chips} accessibilityRole="radiogroup" accessibilityLabel="Minutos de retraso">
                      {[...new Set([...(est.minutos && !MINUTOS.includes(est.minutos) ? [est.minutos] : []), ...MINUTOS])].map((m) => {
                        const on = minutos === m;
                        return (
                          <Pressable key={m} onPress={() => setRetraso(m)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                            style={({ pressed }) => [e.chip, on && e.chipOn, pressed && { opacity: 0.75 }]}>
                            <Text style={[e.chipTexto, on && { color: "#fde68a" }]}>+{m} min</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  <Boton texto={`${BOTON_AVISO[tipo]} · WhatsApp`} variante="exito" alto={60} tamano={18} deshabilitado={!tel} onPress={() => void enviar(tipo, "whatsapp")} />
                  <Text style={e.vista}>{texto(tipo)}</Text>
                  <Boton texto="Enviar por SMS" variante="texto" alto={44} tamano={16} deshabilitado={!tel} onPress={() => void enviar(tipo, "sms")} />
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.borde },
  titulo: { color: "#4ade80", fontSize: 21, fontWeight: "800", flexShrink: 1 },
  contenido: { padding: 16, gap: 14, paddingBottom: 32 },
  parado: { color: "#fde68a", backgroundColor: "#422006", borderRadius: 10, padding: 10, fontSize: 16, fontWeight: "700" },
  error: { color: "#fca5a5", fontSize: 16 },
  bloque: { borderWidth: 1, borderColor: color.borde, borderRadius: 14, padding: 12, gap: 8, backgroundColor: color.tarjeta },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, borderRadius: 10, borderWidth: 1.5, borderColor: color.borde, paddingHorizontal: 12, justifyContent: "center" },
  chipOn: { borderColor: "#f59e0b", backgroundColor: "#451a03" },
  chipTexto: { color: color.texto, fontSize: 16, fontWeight: "700" },
  vista: { color: color.textoTenue, fontSize: 14 },
  hecho: { color: "#86efac", fontSize: 15 },
});
