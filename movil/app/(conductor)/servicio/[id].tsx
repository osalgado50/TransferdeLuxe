import { ultimoEventoAccion, type EventoPaso } from "@dominio/deshacer";
import { rangosConductor } from "@dominio/dias";
import { objetivoActual, type Fase } from "@dominio/navegacion";
import { leerModulos } from "@dominio/modulos";
import { urlVuelo } from "@dominio/vuelos";
import { avisosDisponibles } from "@dominio/avisoCliente";
import type { EstadoServicio, Punto, Servicio } from "@dominio/tipos";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BloqueDireccion } from "~/components/BloqueDireccion";
import { BotonPaso } from "~/components/BotonPaso";
import { EstadoBadge } from "~/components/EstadoBadge";
import { EstadoConexion } from "~/components/EstadoConexion";
import { BotonIncidencia } from "~/components/Incidencias";
import { MapaServicio } from "~/components/MapaServicio";
import { ContadorPuntualidad } from "~/components/Puntualidad";
import { AvisoCliente } from "~/components/AvisoCliente";
import { DevolverServicio } from "~/components/DevolverServicio";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { fechaHora, fmt, hora } from "~/lib/formato";
import { exigir } from "~/lib/servicios";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

async function abrir(url: string, alternativa?: string) {
  try { await Linking.openURL(url); }
  catch {
    if (alternativa) { try { await Linking.openURL(alternativa); return; } catch { /* sigue */ } }
    Alert.alert("No se pudo abrir", "Comprueba que la app está instalada.");
  }
}

export default function ServicioEnCurso() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sesion } = useSesion();
  const yo = sesion!.user.id;
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const r = rangosConductor(new Date()).hoy;
    const [s, hoy, aj, evs] = await Promise.all([
      supabase.from("servicios").select("*").eq("id", id).eq("conductor_id", yo).maybeSingle(),
      supabase.from("servicios").select("id").eq("conductor_id", yo).gte("fecha_hora_recogida", r.desde).lt("fecha_hora_recogida", r.hasta)
        .not("estado", "in", "(cancelado,completado)").neq("id", id).order("fecha_hora_recogida").limit(1),
      supabase.from("ajustes").select("modulos").maybeSingle(),
      // Último paso según el servidor: cuenta atrás de «↩ Deshacer» (10 min) también al volver a la pantalla.
      supabase.from("eventos_servicio").select("id,tipo,actor_id,creado_en").eq("servicio_id", id)
        .order("creado_en", { ascending: false }).order("id", { ascending: false }).limit(30),
    ]);
    return { s: exigir(s) as Servicio | null, ultimoPaso: ultimoEventoAccion((evs.data ?? []) as EventoPaso[]), siguienteId: (exigir(hoy) as { id: string }[])[0]?.id ?? null, vuelos: leerModulos(aj.data?.modulos).vuelos, incidencias: leerModulos(aj.data?.modulos).incidencias };
  }, [id, yo]);

  const s = datos?.s;
  const [fase, setFase] = useState<Fase>("lejos");
  const [eta, setEta] = useState<number | null>(null);
  const [distM, setDistM] = useState<number | null>(null);
  // Tras «No puedo hacer este servicio»: copia local para avisar al cliente del cambio (el servicio ya no es suyo).
  const [devuelto, setDevuelto] = useState<{ telefono: string | null; cliente: string | null; recogida: string; estado: string } | null>(null);
  const volver = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel="Volver"
      style={estilos.volver} hitSlop={8}>
      <Ionicons name="chevron-back" size={26} color={color.marcaClaro} /><Text style={estilos.volverTexto}>Hoy</Text>
    </Pressable>
  );
  if (devuelto) {
    return (
      <SafeAreaView style={estilos.pantalla}>
        {volver}
        <ScrollView contentContainerStyle={estilos.contenido}>
          <EstadoConexion />
          <Text style={estilos.devuelto}>🔁 Servicio devuelto a la central</Text>
          <Text style={estilos.texto}>La central asignará otro conductor. Avisa al cliente del cambio:</Text>
          <AvisoCliente servicioId={id} estado={devuelto.estado} recogida={devuelto.recogida} telefono={devuelto.telefono} cliente={devuelto.cliente}
            tipos={["reasignacion"]} abiertoInicial etiqueta="💬  Avisar al cliente del cambio" />
          <Boton texto="Volver a Hoy" variante="secundario" onPress={() => router.dismissTo("/")} />
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (!s) {
    return (
      <SafeAreaView style={estilos.pantalla}>
        {volver}
        <View style={{ padding: 16, gap: 8 }}>
          <EstadoConexion />
          {cargando ? <Aviso texto="Cargando…" /> : error ? <Aviso tipo="error" texto={`Error al cargar: ${error}`} />
            : <Aviso texto="Este servicio ya no está asignado a ti." />}
        </View>
      </SafeAreaView>
    );
  }
  const pt = (lat: number | null, lng: number | null): Punto | null => (lat != null && lng != null ? { lat, lng } : null);
  const estado = s.estado as EstadoServicio;
  const meta = estado === "recogido" || estado === "completado" ? pt(s.destino_lat, s.destino_lng) : pt(s.origen_lat, s.origen_lng);
  const objetivo = objetivoActual(estado, s);
  const nombre = `${s.cliente_nombre} ${s.cliente_apellidos ?? ""}`.trim();

  return (
    <SafeAreaView style={estilos.pantalla} edges={["top", "bottom"]}>
      {volver}
      <ScrollView contentContainerStyle={estilos.contenido}>
        <EstadoConexion />
        <View style={estilos.fila}>
          <Text style={estilos.hora}>{fmt(hora, s.fecha_hora_recogida)}</Text>
          <EstadoBadge estado={estado} />
        </View>
        <Text style={estilos.tenue}>{fmt(fechaHora, s.fecha_hora_recogida)}</Text>
        <ContadorPuntualidad servicioId={s.id} estado={estado} recogida={s.fecha_hora_recogida} etaS={objetivo?.tipo === "recogida" ? eta : null} />
        {error && <Aviso tipo="error" texto={`Sin conexión: datos de hace un momento (${error})`} />}
        {/* Controles primero: el conductor va conduciendo y necesita los botones a mano, sin hacer scroll. */}
        <View style={{ gap: 10 }}>
          <BotonPaso key={s.id} servicioId={s.id} conductorId={yo} estadoServidor={estado} siguienteId={datos?.siguienteId ?? null}
            alCambiar={() => void recargar()} resaltar={!!objetivo && fase === "llegado"} ultimoPaso={datos?.ultimoPaso ?? null}
            distancia={objetivo && distM != null ? { tipo: objetivo.tipo, distanciaM: distM } : null} />
          {!!s.cliente_telefono && s.estado !== "completado" && (
            <Boton texto="📞  Llamar al cliente" alto={64} tamano={19} variante="secundario"
              onPress={() => void abrir(`tel:${s.cliente_telefono.replace(/[^\d+]/g, "")}`)} />
          )}
          <AvisoCliente servicioId={s.id} estado={estado} recogida={s.fecha_hora_recogida} telefono={s.cliente_telefono} cliente={s.cliente_nombre}
            tipos={avisosDisponibles(estado)} etaS={objetivo?.tipo === "recogida" ? eta : null} />
          {datos?.incidencias && s.estado !== "completado" && <BotonIncidencia servicioId={s.id} />}
          <DevolverServicio servicioId={s.id} conductorId={yo} estado={estado}
            alDevolver={() => setDevuelto({ telefono: s.cliente_telefono, cliente: s.cliente_nombre, recogida: s.fecha_hora_recogida, estado })} />
        </View>
        <Tarjeta>
          <BloqueDireccion tipo="recogida" texto={s.origen_texto} lat={s.origen_lat} lng={s.origen_lng} />
          <BloqueDireccion tipo="destino" texto={s.destino_texto} lat={s.destino_lat} lng={s.destino_lng} />
          <Text style={estilos.texto}><Text style={estilos.tenue}>Cliente: </Text>{nombre} · {s.pasajeros} pax · {s.maletas} maletas</Text>
          {datos?.vuelos && s.numero_vuelo && <Text style={estilos.texto}><Text style={estilos.tenue}>Vuelo: </Text>{s.numero_vuelo}{"  "}
            <Text accessibilityRole="link" style={{ color: color.marcaClaro, textDecorationLine: "underline" }} onPress={() => void abrir(urlVuelo(s.numero_vuelo!))}>Ver vuelo</Text></Text>}
          {s.notas && <Text style={estilos.texto}><Text style={estilos.tenue}>Notas: </Text>{s.notas}</Text>}
        </Tarjeta>
        {objetivo && (
          <MapaServicio key={`${s.id}:${objetivo.tipo}`} servicioId={s.id} objetivo={objetivo}
            origenServicio={pt(s.origen_lat, s.origen_lng)} alCambiarFase={setFase} alCambiarEta={setEta} alCambiarDistancia={setDistM} />
        )}
        {meta && (
          <View style={estilos.dos}>
            <Boton texto="Google Maps" variante="secundario" estilo={{ flex: 1 }}
              onPress={() => void abrir(`https://www.google.com/maps/dir/?api=1&destination=${meta.lat},${meta.lng}`)} />
            <Boton texto="Waze" variante="secundario" estilo={{ flex: 1 }}
              onPress={() => void abrir(`waze://?ll=${meta.lat},${meta.lng}&navigate=yes`, `https://waze.com/ul?ll=${meta.lat},${meta.lng}&navigate=yes`)} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  volver: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 10 },
  volverTexto: { color: color.marcaClaro, fontSize: 18, fontWeight: "600" },
  contenido: { padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hora: { color: color.marcaClaro, fontSize: 36, fontWeight: "800" },
  texto: { color: color.texto, fontSize: 17 },
  tenue: { color: color.textoTenue, fontSize: 15 },
  dos: { flexDirection: "row", gap: 12 },
  devuelto: { color: "#fcd34d", fontSize: 22, fontWeight: "800" },
});
