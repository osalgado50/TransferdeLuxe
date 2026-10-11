import { agruparServiciosCentral } from "@dominio/centralMovil";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EstadoBadge } from "~/components/EstadoBadge";
import { Aviso } from "~/components/ui";
import { useCentral, type ServicioCentral } from "~/lib/central";
import { fechaHora, fmt, hora } from "~/lib/formato";
import { color } from "~/lib/tema";

function Fila({ s, conductor, conDia }: { s: ServicioCentral; conductor: string | null; conDia: boolean }) {
  const h = fmt(conDia ? fechaHora : hora, s.fecha_hora_recogida);
  return (
    <Pressable onPress={() => router.push(`/central/ficha/${s.id}`)} accessibilityRole="button"
      accessibilityLabel={`${h}, ${s.origen_texto} a ${s.destino_texto}, ${conductor ?? "sin conductor"}`}
      style={({ pressed }) => [estilos.fila, pressed && { borderColor: color.marcaClaro }]}>
      <View style={estilos.cabFila}>
        <Text style={conDia ? estilos.dia : estilos.hora}>{h}</Text>
        <EstadoBadge estado={s.estado} />
      </View>
      <Text style={estilos.ruta} numberOfLines={2}>{s.origen_texto} → {s.destino_texto}</Text>
      <Text style={estilos.meta}>{s.pasajeros} pax · {s.maletas} maletas · {conductor ?? "Sin conductor"}{s.numero_vuelo ? ` · ${s.numero_vuelo}` : ""}</Text>
    </Pressable>
  );
}

export default function Servicios() {
  const { datos, cargando, error, recargar } = useCentral();
  const [refrescando, setRefrescando] = useState(false);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const grupos = useMemo(() => (datos ? agruparServiciosCentral(datos.pendientes, datos.hoy) : []), [datos]);
  const idsHoy = useMemo(() => new Set(datos?.hoy.map((s) => s.id)), [datos]);
  const nombre = (id: string | null) => (id ? datos?.conductores.find((c) => c.id === id)?.nombre ?? "Conductor" : null);
  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      {error && !datos && <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} />}
      {cargando ? <Aviso texto="Cargando…" />
        : grupos.length === 0 ? <Text style={estilos.vacio}>No hay servicios pendientes ni para hoy.</Text>
        : grupos.map((g) => (
          <View key={g.clave} style={{ gap: 10 }}>
            <Text style={estilos.titulo} accessibilityRole="header">{g.titulo} ({g.servicios.length})</Text>
            {g.servicios.map((s) => <Fila key={s.id} s={s} conductor={nombre(s.conductor_id)} conDia={!idsHoy.has(s.id)} />)}
          </View>
        ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 16, paddingBottom: 40 },
  titulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "700" },
  vacio: { color: color.textoTenue, fontSize: 16, textAlign: "center", paddingVertical: 24 },
  fila: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta, borderRadius: 16, padding: 16, gap: 4, minHeight: 64 },
  cabFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hora: { color: color.texto, fontSize: 28, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dia: { color: color.texto, fontSize: 18, fontWeight: "700" },
  ruta: { color: color.texto, fontSize: 17 },
  meta: { color: color.textoTenue, fontSize: 15 },
});
