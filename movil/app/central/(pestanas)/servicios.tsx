import { FILTROS_GRUPO, agruparServiciosCentral, contarServiciosPorGrupo, filtrarPorGrupo, filtroInicial, serviciosCentralUnicos,
  type FiltroGrupo } from "@dominio/centralMovil";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChipPuntualidad } from "~/components/ChipPuntualidad";
import { EstadoBadge } from "~/components/EstadoBadge";
import { Aviso } from "~/components/ui";
import type { IndicadorPuntualidad } from "@dominio/puntualidadCentral";
import { useCentral, type ServicioCentral } from "~/lib/central";
import { fechaHora, fmt, hora } from "~/lib/formato";
import { color } from "~/lib/tema";

function Fila({ s, conductor, conDia, punt }: { s: ServicioCentral; conductor: string | null; conDia: boolean; punt?: IndicadorPuntualidad }) {
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
      <ChipPuntualidad ind={punt} />
    </Pressable>
  );
}

// Filtro elegido: se conserva mientras la app esté abierta (aunque se cambie de pestaña).
let filtroMemoria: FiltroGrupo | null = null;

function Chips({ filtro, cont, elegir }: { filtro: FiltroGrupo; cont: Record<FiltroGrupo, number>; elegir: (f: FiltroGrupo) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.barraChips} contentContainerStyle={estilos.chips}>
      {FILTROS_GRUPO.map((g) => {
        const on = g.clave === filtro;
        return (
          <Pressable key={g.clave} onPress={() => elegir(g.clave)} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={`${g.titulo}, ${cont[g.clave]} servicios`}
            style={({ pressed }) => [estilos.chip, on && estilos.chipOn, pressed && !on && { borderColor: color.marcaClaro }]}>
            <Text style={[estilos.chipTexto, on && { color: "#fff" }]}>{g.titulo} ({cont[g.clave]})</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function Servicios() {
  const { datos, cargando, error, recargar } = useCentral();
  const [refrescando, setRefrescando] = useState(false);
  const [elegido, setElegido] = useState<FiltroGrupo | null>(filtroMemoria);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const todos = useMemo(() => (datos ? serviciosCentralUnicos(datos.pendientes, datos.hoy) : []), [datos]);
  const cont = useMemo(() => contarServiciosPorGrupo(todos), [todos]);
  const filtro = elegido ?? filtroInicial(cont);
  const elegir = (f: FiltroGrupo) => { filtroMemoria = f; setElegido(f); };
  const grupos = useMemo(() => (filtro === "todos" ? agruparServiciosCentral(todos) : []), [todos, filtro]);
  const filtrados = useMemo(() => filtrarPorGrupo(todos, filtro), [todos, filtro]);
  const idsHoy = useMemo(() => new Set(datos?.hoy.map((s) => s.id)), [datos]);
  const nombre = (id: string | null) => (id ? datos?.conductores.find((c) => c.id === id)?.nombre ?? "Conductor" : null);
  const fila = (s: ServicioCentral) => <Fila key={s.id} s={s} conductor={nombre(s.conductor_id)} conDia={!idsHoy.has(s.id)} punt={datos?.puntualidad?.[s.id]} />;
  const tituloFiltro = FILTROS_GRUPO.find((g) => g.clave === filtro)?.titulo ?? "";
  return (
    <View style={{ flex: 1 }}>
      {datos && <Chips filtro={filtro} cont={cont} elegir={elegir} />}
      <ScrollView contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
        {error && !datos && <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} />}
        {cargando ? <Aviso texto="Cargando…" />
          : todos.length === 0 ? <Text style={estilos.vacio}>No hay servicios pendientes ni para hoy.</Text>
          : filtro === "todos" ? grupos.map((g) => (
            <View key={g.clave} style={{ gap: 10 }}>
              <Text style={estilos.titulo} accessibilityRole="header">{g.titulo} ({g.servicios.length})</Text>
              {g.servicios.map(fila)}
            </View>
          ))
          : filtrados.length === 0 ? <Text style={estilos.vacio}>No hay servicios en «{tituloFiltro}».</Text>
          : <View style={{ gap: 10 }}>{filtrados.map(fila)}</View>}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 16, paddingBottom: 40 },
  barraChips: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: color.borde },
  chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta },
  chipOn: { backgroundColor: color.marca, borderColor: color.marca },
  chipTexto: { color: color.textoSuave, fontSize: 16, fontWeight: "600" },
  titulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "700" },
  vacio: { color: color.textoTenue, fontSize: 16, textAlign: "center", paddingVertical: 24 },
  fila: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta, borderRadius: 16, padding: 16, gap: 4, minHeight: 64 },
  cabFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hora: { color: color.texto, fontSize: 28, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dia: { color: color.texto, fontSize: 18, fontWeight: "700" },
  ruta: { color: color.texto, fontSize: 17 },
  meta: { color: color.textoTenue, fontSize: 15 },
});
