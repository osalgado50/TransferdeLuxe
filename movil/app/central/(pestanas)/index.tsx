import type { Movimiento } from "@dominio/actividad";
import { textoAlertaCentral } from "@dominio/centralMovil";
import { nombreTipoIncidencia } from "@dominio/incidencias";
import { etiquetaZona } from "@dominio/cierre";
import { marcadoresFlota } from "@dominio/mapa";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MapaFlota } from "~/components/MapaFlota";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { marcarAlertaVista, marcarCierreVisto, resolverIncidencia, useCentral, type ServicioCentral } from "~/lib/central";
import { fechaHora, fmt } from "~/lib/formato";
import { color } from "~/lib/tema";

function TarjetaAlerta({ s, nombre, alVisto, devueltoPor }: { s: ServicioCentral; nombre: (id: string | null) => string; alVisto: () => Promise<void>; devueltoPor?: string | null }) {
  const [enviando, setEnviando] = useState(false);
  const a = textoAlertaCentral(s, nombre, devueltoPor);
  return (
    <Tarjeta destacada>
      <Text style={estilos.alertaTitulo}>{a.titulo}</Text>
      <Text style={estilos.alertaTexto}>{a.texto}</Text>
      <Text style={estilos.meta}>{fmt(fechaHora, s.fecha_hora_recogida)} · {s.origen_texto} → {s.destino_texto}</Text>
      <View style={estilos.fila}>
        <Boton texto={(s.ultima_incidencia ?? "").startsWith("devuelto") ? "Reasignar" : "Abrir"} variante="secundario" estilo={{ flex: 1 }} onPress={() => router.push(`/central/ficha/${s.id}`)} />
        <Boton texto="Visto" estilo={{ flex: 1 }} cargando={enviando} etiqueta={`Marcar como vista la alerta: ${a.titulo}`}
          onPress={async () => { setEnviando(true); await alVisto(); setEnviando(false); }} />
      </View>
    </Tarjeta>
  );
}

/** Hoja de cierre con daños / testigo / avería: roja y fija, con conductor, matrícula, zonas y comentario, hasta «Visto» (para toda la central). */
function TarjetaCierre({ g, alVisto }: { g: Movimiento; alVisto: () => Promise<void> }) {
  const [enviando, setEnviando] = useState(false);
  const zonas = g.zonasDanadas ?? [];
  return (
    <View style={estilos.grave} accessibilityRole="alert">
      <Text style={estilos.graveTitulo}>🔴 HOJA DE CIERRE · {g.conductor ?? "Conductor"}</Text>
      <Text style={estilos.graveZona}>{g.matricula ?? "Vehículo"} · {g.hora}</Text>
      <Text style={estilos.graveTexto}>{g.texto.replace(/ · «.*»$/, "")}</Text>
      {zonas.length > 0 && <View accessibilityLabel={`Zonas dañadas: ${zonas.map(etiquetaZona).join(", ")}`}>
        {zonas.map((z) => <Text key={z} style={estilos.graveMeta}>• {etiquetaZona(z)}</Text>)}
      </View>}
      {!!g.descripcion && <Text style={estilos.graveTexto}>«{g.descripcion}»</Text>}
      <View style={estilos.fila}>
        {!!g.telefono && <Boton texto="📞 Llamar" variante="peligro" estilo={{ flex: 1 }} etiqueta={`Llamar a ${g.conductor ?? "conductor"}`}
          onPress={() => { void Linking.openURL(`tel:${g.telefono}`).catch(() => undefined); }} />}
        <Boton texto="Visto" variante="secundario" estilo={{ flex: 1 }} cargando={enviando} etiqueta={`Marcar vista la hoja de cierre de ${g.conductor ?? "conductor"}`}
          onPress={async () => { setEnviando(true); await alVisto(); setEnviando(false); }} />
      </View>
    </View>
  );
}

/** Lo GRAVE (avería, accidente, golpe): rojo, fijo arriba, con conductor, zona y datos, hasta «Visto» o «Resuelta». */
function TarjetaGrave({ g, alVisto, alResuelta }: { g: Movimiento; alVisto: () => void; alResuelta: () => Promise<void> }) {
  const [enviando, setEnviando] = useState(false);
  const tipo = nombreTipoIncidencia(g.tipo.replace(/^incidencia_/, "")).toUpperCase();
  return (
    <View style={estilos.grave} accessibilityRole="alert">
      <Text style={estilos.graveTitulo}>⚠ {tipo} · {g.conductor ?? "Conductor"}</Text>
      <Text style={estilos.graveZona}>{g.zona ?? "Zona desconocida (sin GPS)"} · {g.hora}</Text>
      {(g.zonasDanadas ?? []).length > 0 && <View accessibilityLabel={`Zonas dañadas: ${(g.zonasDanadas ?? []).map(etiquetaZona).join(", ")}`}>
        <Text style={estilos.graveTexto}>Daños:</Text>
        {(g.zonasDanadas ?? []).map((z) => <Text key={z} style={estilos.graveMeta}>• {etiquetaZona(z)}</Text>)}
      </View>}
      {!!g.descripcion && <Text style={estilos.graveTexto}>{g.descripcion}</Text>}
      {!!g.detalle && <Text style={estilos.graveMeta}>Servicio: {g.detalle}</Text>}
      <View style={estilos.fila}>
        {!!g.telefono && <Boton texto="📞 Llamar" variante="peligro" estilo={{ flex: 1 }} etiqueta={`Llamar a ${g.conductor ?? "conductor"}`}
          onPress={() => { void Linking.openURL(`tel:${g.telefono}`).catch(() => undefined); }} />}
        <Boton texto="Visto" variante="secundario" estilo={{ flex: 1 }} etiqueta={`Marcar vista: ${tipo}`} onPress={alVisto} />
      </View>
      {!!g.incidenciaId && <Boton texto="Marcar resuelta" cargando={enviando} etiqueta={`Marcar resuelta: ${tipo}`}
        onPress={async () => { setEnviando(true); await alResuelta(); setEnviando(false); }} />}
    </View>
  );
}

/** CARGA/DESCARGA lejos del punto o jornada cerrada con pendientes: aviso ámbar con «Llamar» y «Mapa». */
function TarjetaAviso({ g, alVisto }: { g: Movimiento; alVisto: () => void }) {
  return (
    <View style={estilos.avisoAt} accessibilityRole="alert">
      <Text style={estilos.avisoAtTitulo}>{g.texto}</Text>
      <Text style={estilos.graveMeta}>{g.hora}{g.detalle ? ` · ${g.detalle}` : ""}</Text>
      <View style={estilos.fila}>
        {!!g.telefono && <Boton texto="📞 Llamar" estilo={{ flex: 1 }} etiqueta={`Llamar a ${g.conductor ?? "conductor"}`}
          onPress={() => { void Linking.openURL(`tel:${g.telefono}`).catch(() => undefined); }} />}
        {g.lat != null && g.lng != null && <Boton texto="📍 Mapa" variante="secundario" estilo={{ flex: 1 }} etiqueta="Ver la posición en el mapa"
          onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}`).catch(() => undefined); }} />}
        <Boton texto="Visto" variante="secundario" estilo={{ flex: 1 }} onPress={alVisto} />
      </View>
    </View>
  );
}

const COLOR_MOV = { grave: "#fca5a5", aviso: "#fcd34d", info: color.texto } as const;
const VERDE = "#86efac"; // hoja de cierre sin incidencias
const VISIBLES = 8;

/** Lista compacta de la actividad en vivo (12 h): los 8 más nuevos y «Ver todo». */
function Actividad({ movimientos }: { movimientos: Movimiento[] }) {
  const [todo, setTodo] = useState(false);
  const lista = todo ? movimientos : movimientos.slice(0, VISIBLES);
  return (
    <View style={estilos.actividad}>
      <Text style={estilos.subtitulo} accessibilityRole="header">Actividad en vivo</Text>
      {movimientos.length === 0 ? <Text style={estilos.meta}>Sin movimientos en las últimas 12 h.</Text> : lista.map((m) => (
        <View key={m.id} style={[estilos.mov, m.gravedad === "grave" && estilos.movGrave]}>
          <Text style={estilos.movIcono}>{m.icono}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[estilos.movTexto, { color: m.tipo === "cierre_ok" ? VERDE : COLOR_MOV[m.gravedad] }]}><Text style={estilos.movHora}>{m.hora}  </Text>{m.texto}</Text>
            {!!m.detalle && <Text style={estilos.movDetalle} numberOfLines={1}>{m.detalle}</Text>}
          </View>
        </View>
      ))}
      {movimientos.length > VISIBLES && <Boton texto={todo ? "Ver menos" : `Ver todo (${movimientos.length})`} variante="texto" alto={44} tamano={16} onPress={() => setTodo(!todo)} />}
    </View>
  );
}

export default function Central() {
  const { datos, umbral, cargando, error, recargar, vistos, marcarGraveVista } = useCentral();
  const [refrescando, setRefrescando] = useState(false);
  const [errorVisto, setErrorVisto] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const nombre = (id: string | null) => datos?.conductores.find((c) => c.id === id)?.nombre ?? "conductor";
  const marcadores = useMemo(() => (datos ? marcadoresFlota(datos.posiciones, datos.hoy, datos.conductores, ahora, umbral) : []), [datos, ahora, umbral]);
  const alertas = datos?.alertas ?? [];
  const graves = (datos?.graves ?? []).filter((g) => !vistos.has(g.id));
  const avisos = (datos?.avisos ?? []).filter((g) => !vistos.has(g.id));

  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      {graves.map((g) => g.cierreId ? (
        <TarjetaCierre key={g.id} g={g} alVisto={async () => {
          const e = await marcarCierreVisto(g.cierreId!);
          setErrorVisto(e);
          marcarGraveVista(g.id);
          await recargar();
        }} />
      ) : (
        <TarjetaGrave key={g.id} g={g} alVisto={() => marcarGraveVista(g.id)} alResuelta={async () => {
          const e = await resolverIncidencia(g.incidenciaId!);
          setErrorVisto(e);
          if (!e) marcarGraveVista(g.id);
          await recargar();
        }} />
      ))}
      {avisos.map((g) => <TarjetaAviso key={g.id} g={g} alVisto={() => marcarGraveVista(g.id)} />)}
      {/* Sin alertas: una franja verde pequeña (deja sitio al mapa). Con alertas: título y tarjetas. */}
      {!cargando && alertas.length === 0 && graves.length === 0 && !error
        ? <View style={estilos.ok} accessibilityRole="text"><Text style={estilos.okTexto}>✓ Sin alertas · todo en orden</Text></View>
        : <Text style={estilos.titulo} accessibilityRole="header">Alertas ({alertas.length})</Text>}
      {error && !datos && <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} />}
      {errorVisto && <Aviso tipo="error" texto={errorVisto} />}
      {cargando ? <Aviso texto="Cargando…" />
        : alertas.length === 0 ? null
        : alertas.map((s) => (
          <TarjetaAlerta key={s.id} s={s} nombre={nombre}
            devueltoPor={datos?.actividad?.find((m) => m.tipo === "devuelto" && m.servicioId === s.id)?.conductor ?? null} alVisto={async () => {
            const e = await marcarAlertaVista(s.id);
            setErrorVisto(e);
            await recargar();
          }} />
        ))}
      {datos?.actividad && <Actividad movimientos={datos.actividad} />}
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
  grave: { backgroundColor: "#450a0a", borderColor: "#ef4444", borderWidth: 3, borderRadius: 14, padding: 14, gap: 6 },
  graveTitulo: { color: "#fee2e2", fontSize: 24, fontWeight: "900" },
  graveZona: { color: "#fecaca", fontSize: 18, fontWeight: "700" },
  graveTexto: { color: "#fff", fontSize: 18 },
  graveMeta: { color: "#fecaca", fontSize: 15 },
  actividad: { gap: 6 },
  subtitulo: { color: color.marcaClaro, fontSize: 20, fontWeight: "700", marginTop: 4 },
  mov: { flexDirection: "row", gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.borde },
  avisoAt: { borderWidth: 2, borderColor: "#f59e0b", backgroundColor: "rgba(120,53,15,0.5)", borderRadius: 14, padding: 12, gap: 8 },
  avisoAtTitulo: { color: "#fde68a", fontSize: 17, fontWeight: "800" },
  movGrave: { borderColor: "#ef4444", backgroundColor: "rgba(127,29,29,0.5)" },
  movIcono: { fontSize: 16, width: 22, textAlign: "center" },
  movTexto: { fontSize: 15 },
  movHora: { color: color.textoTenue, fontSize: 13, fontVariant: ["tabular-nums"] },
  movDetalle: { color: color.textoTenue, fontSize: 13 },
});
