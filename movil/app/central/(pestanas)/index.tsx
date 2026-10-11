import { textoAlertaCentral } from "@dominio/centralMovil";
import { marcadoresFlota } from "@dominio/mapa";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MapaFlota } from "~/components/MapaFlota";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { marcarAlertaVista, useCentral, type ServicioCentral } from "~/lib/central";
import { fechaHora, fmt } from "~/lib/formato";
import { color } from "~/lib/tema";

function TarjetaAlerta({ s, nombre, alVisto }: { s: ServicioCentral; nombre: (id: string | null) => string; alVisto: () => Promise<void> }) {
  const [enviando, setEnviando] = useState(false);
  const a = textoAlertaCentral(s, nombre);
  return (
    <Tarjeta destacada>
      <Text style={estilos.alertaTitulo}>{a.titulo}</Text>
      <Text style={estilos.alertaTexto}>{a.texto}</Text>
      <Text style={estilos.meta}>{fmt(fechaHora, s.fecha_hora_recogida)} · {s.origen_texto} → {s.destino_texto}</Text>
      <View style={estilos.fila}>
        <Boton texto="Abrir" variante="secundario" estilo={{ flex: 1 }} onPress={() => router.push(`/central/ficha/${s.id}`)} />
        <Boton texto="Visto" estilo={{ flex: 1 }} cargando={enviando} etiqueta={`Marcar como vista la alerta: ${a.titulo}`}
          onPress={async () => { setEnviando(true); await alVisto(); setEnviando(false); }} />
      </View>
    </Tarjeta>
  );
}

export default function Central() {
  const { datos, umbral, cargando, error, recargar } = useCentral();
  const [refrescando, setRefrescando] = useState(false);
  const [errorVisto, setErrorVisto] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const nombre = (id: string | null) => datos?.conductores.find((c) => c.id === id)?.nombre ?? "conductor";
  const marcadores = useMemo(() => (datos ? marcadoresFlota(datos.posiciones, datos.hoy, datos.conductores, ahora, umbral) : []), [datos, ahora, umbral]);
  const alertas = datos?.alertas ?? [];

  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      {/* Sin alertas: una franja verde pequeña (deja sitio al mapa). Con alertas: título y tarjetas. */}
      {!cargando && alertas.length === 0 && !error
        ? <View style={estilos.ok} accessibilityRole="text"><Text style={estilos.okTexto}>✓ Sin alertas · todo en orden</Text></View>
        : <Text style={estilos.titulo} accessibilityRole="header">Alertas ({alertas.length})</Text>}
      {error && !datos && <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} />}
      {errorVisto && <Aviso tipo="error" texto={errorVisto} />}
      {cargando ? <Aviso texto="Cargando…" />
        : alertas.length === 0 ? null
        : alertas.map((s) => (
          <TarjetaAlerta key={s.id} s={s} nombre={nombre} alVisto={async () => {
            const e = await marcarAlertaVista(s.id);
            setErrorVisto(e);
            await recargar();
          }} />
        ))}
      <MapaFlota marcadores={marcadores} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { color: color.marcaClaro, fontSize: 24, fontWeight: "700" },
  vacio: { color: color.textoTenue, fontSize: 16, textAlign: "center", paddingVertical: 16 },
  ok: { backgroundColor: "rgba(22,163,74,0.18)", borderColor: "#22c55e", borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  okTexto: { color: "#86efac", fontSize: 16, fontWeight: "700", textAlign: "center" },
  alertaTitulo: { color: "#fcd34d", fontSize: 20, fontWeight: "800" },
  alertaTexto: { color: color.texto, fontSize: 17 },
  meta: { color: color.textoTenue, fontSize: 15 },
  fila: { flexDirection: "row", gap: 10, marginTop: 8 },
});
